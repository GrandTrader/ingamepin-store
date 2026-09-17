const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  vm.runInNewContext(js, { exports, require: (name) => { if (name in mocks) return mocks[name]; throw Error('Unexpected dependency: '+name); }, URL, console, Buffer, setTimeout, clearTimeout }, { filename: file });
  return exports;
}
const {hasRequiredAdminAssurance} = load('lib/admin-assurance.ts');
const session = (level, factors=[], error=null) => ({auth:{mfa:{
  getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:level},error}),
  listFactors:async()=>({data:{all:factors},error})
}}});
test('two-factor enforcement permits only appropriate assurance and fails closed',async()=>{
  assert.equal(await hasRequiredAdminAssurance(session('aal1')),true);
  assert.equal(await hasRequiredAdminAssurance(session('aal1',[{status:'unverified'}])),true);
  assert.equal(await hasRequiredAdminAssurance(session('aal1',[{status:'verified'}])),false);
  assert.equal(await hasRequiredAdminAssurance(session('aal2',[{status:'verified'}])),true);
  assert.equal(await hasRequiredAdminAssurance(session('aal2',[],{message:'offline'})),false);
  assert.equal(await hasRequiredAdminAssurance({auth:{mfa:{listFactors:async()=>{throw Error('offline')},getAuthenticatorAssuranceLevel:async()=>({})}}}),false);
});
const {isAllowedPushEndpoint} = load('lib/push-endpoint.ts');
test('push endpoints allow browser services and reject SSRF destinations',()=>{
 for(const url of ['https://fcm.googleapis.com/fcm/send/token','https://updates.push.services.mozilla.com/wpush/v2/token','https://web.push.apple.com/token','https://wns2.notify.windows.com/token']) assert.equal(isAllowedPushEndpoint(url),true,url);
 for(const url of ['https://localhost/a','https://127.0.0.1/a','https://169.254.169.254/','https://evil.example/','https://fcm.googleapis.com.evil.example/a','https://evilnotify.windows.com/a','https://user:pass@fcm.googleapis.com/a','http://fcm.googleapis.com/a','https://fcm.googleapis.com:8443/a','not a url']) assert.equal(isAllowedPushEndpoint(url),false,url);
});
test('order lookup requires literal email match before fetching delivered codes',async()=>{
 let codeReads=0;
 const query={select(){return this},eq(){return this},maybeSingle:async()=>({data:{id:'test-order',customer_email:'Owner_Test@Example.com',order_number:'IGP-TEST-0001'}})};
 const {POST}=load('app/api/orders/lookup/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>({body,status:options?.status??200})}},
  '@/lib/supabase/admin':{createAdminClient:()=>({from:(table)=>table==='orders'?query:{select(){return this},eq(){return this},order:async()=>({data:[]})}})},
  '@/lib/delivered-codes':{getAllDeliveredCodes:async()=>{codeReads++;return []}}
 });
 for(const email of ['%@%.com','owner%test@example.com','owner_test@wrong.com','ownerXtest@example.com']) {
   assert.equal((await POST({json:async()=>({email,orderNumber:'IGP-TEST-0001'})})).status,404);
 }
 assert.equal(codeReads,0);
 assert.equal((await POST({json:async()=>({email:' owner_test@example.com ',orderNumber:'IGP-TEST-0001'})})).status,200);
 assert.equal(codeReads,1);
});
test('admin action modules use the guarded session client',()=>{
 function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(dir+'/'+x.name):[dir+'/'+x.name]);}
 for(const file of walk('app/admin').filter(x=>x.endsWith('.ts')&&!x.includes('/login/')&&x!=='app/admin/actions.ts')){
  const content=fs.readFileSync(file,'utf8');
  if(content.includes('"use server"')) assert.equal(content.includes('from "@/lib/supabase/server"'),false,file);
 }
});
const {deliveredUnits} = load('lib/delivery-progress.ts');
test('service delivery totals and invoice eligibility work without voucher codes',()=>{
 assert.equal(deliveredUnits({quantity:3,service_delivered_at:'2026-09-17'},0,'PROCESSING'),3);
 assert.equal(deliveredUnits({quantity:3,fulfillment_mode:'PLAYER_ID_TOPUP'},0,'PROCESSING'),0);
 assert.equal(deliveredUnits({quantity:3,fulfillment_mode:'PLAYER_ID_TOPUP'},0,'DELIVERED'),3);
 assert.equal(deliveredUnits({quantity:3},2,'PROCESSING'),2);
 assert.equal(deliveredUnits({quantity:3},0,'DELIVERED'),0);
});
