const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, deps={}) {
  const exports={};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,Error,require:name=>{if(name in deps)return deps[name];throw Error('Unmocked '+name);}});return exports;
}
const logic=load('lib/order-refund-request.ts');
const order='00000000-0000-4000-8000-000000000001', user='00000000-0000-4000-8000-000000000002';
function form(fields={}) {const f=new FormData();for(const [k,v] of Object.entries({order_id:order,method:'WALLET',reason:'No longer needed',...fields}))f.set(k,v);return f;}
test('refund methods match enabled website methods while retaining wallet and original payment',()=>{
  const methods=logic.refundMethods({UPI:{enabled:false},PAYTM:{enabled:true},FREEKASSA:{enabled:false}},'FREEKASSA');
  assert.ok(methods.includes('WALLET'));assert.ok(methods.includes('FREEKASSA'));assert.ok(methods.includes('PAYTM'));assert.ok(!methods.includes('UPI'));
  assert.ok(!logic.refundMethods({},'BINANCE_PAY').includes('PAYTM'));
});
test('customer cannot submit arbitrary references, methods or unbounded text',()=>{
  for(const fields of [{order_id:'wrong'},{method:'BANK_UNSUPPORTED'},{reason:'x'},{reason:'x'.repeat(1001)},{details:'x'.repeat(1001)}])assert.throws(()=>logic.parseRefundRequest(form(fields)));
});
function customerHarness({denied=false,rpcError=null}={}) {
 const calls=[];
 const api=load('app/account/orders/refund-actions.ts',{
  'next/cache':{revalidatePath:path=>calls.push(['revalidate',path])},
  '@/lib/customer-account-data':{requireCustomer:async()=>{calls.push(['auth']);if(denied)throw Error('denied');return {user:{id:user}};}},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {data:order,error:rpcError};}})},
  '@/lib/order-refund-request':logic,
 });return {api,calls};
}
test('customer action authenticates first and takes identity only from session',async()=>{
 const h=customerHarness();assert.equal((await h.api.requestOrderRefund(form({customer_id:'attacker'}))).success,true);
 assert.equal(h.calls[0][0],'auth');assert.equal(h.calls.find(c=>c[0]==='rpc')[2].p_customer_id,user);
 const d=customerHarness({denied:true});await assert.rejects(()=>d.api.requestOrderRefund(form()),/denied/);assert.equal(d.calls.length,1);
});
test('customer validation and RPC failures never report success',async()=>{
 const h=customerHarness();assert.ok((await h.api.requestOrderRefund(form({method:'x'}))).error);assert.ok(!h.calls.some(c=>c[0]==='rpc'));
 const e=customerHarness({rpcError:{code:'XX',message:'private backend details'}});const result=await e.api.requestOrderRefund(form());assert.ok(result.error);assert.ok(!result.error.includes('private'));assert.ok(!e.calls.some(c=>c[0]==='revalidate'));
});
function adminHarness({denied=false}={}) {
 const calls=[];const chain={select(){return chain;},eq(){return chain;},async maybeSingle(){return {data:{order_id:order},error:null};}};
 const api=load('app/admin/refund-requests/actions.ts',{
  'next/cache':{revalidatePath:path=>calls.push(['revalidate',path])},
  '@/lib/order-refund-data':{requireRefundAdmin:async()=>{calls.push(['auth']);if(denied)throw Error('denied');return {id:user};}},
  '@/lib/order-refund-request':logic,
  '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>chain,rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {data:'COMPLETED',error:null};}})},
 });return {api,calls};
}
test('admin action requires admin authentication before reading request or issuing refund',async()=>{
 const h=adminHarness({denied:true});await assert.rejects(()=>h.api.reviewOrderRefund(form({request_id:order,action:'APPROVE'})),/denied/);assert.equal(h.calls.length,1);
});
test('external refund completion requires explicit confirmation and transaction reference',async()=>{
 for(const fields of [{reference:'TX-123'},{confirmed:'on'},{confirmed:'on',reference:'x'}]){
  const h=adminHarness();assert.ok((await h.api.reviewOrderRefund(form({request_id:order,action:'COMPLETE',...fields}))).error);assert.ok(!h.calls.some(c=>c[0]==='rpc'));
 }
 const h=adminHarness();assert.equal((await h.api.reviewOrderRefund(form({request_id:order,action:'COMPLETE',reference:'TX-123',confirmed:'on',admin_id:'attacker'}))).status,'COMPLETED');assert.equal(h.calls.find(c=>c[0]==='rpc')[2].p_admin_id,user);
});
