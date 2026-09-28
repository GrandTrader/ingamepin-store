const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function load(file,mocks={}) {
  const exports={};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{exports,require:name=>{if(name in mocks)return mocks[name];throw Error('Unexpected module '+name);},File,FormData,Uint8Array,Response,console,Map,Set},{filename:file});return exports;
}
const helpers=load('lib/business-verification.ts');
const uid='00000000-0000-4000-8000-000000000010',other='00000000-0000-4000-8000-000000000011';
function form(){const f=new FormData();for(const [key] of helpers.businessFields)f.set(key,'Test business data');f.set('buyer_type','RESELLER');f.set('entity_type','Company');f.set('consent','accepted');for(const key of Object.keys(helpers.businessDocumentLabels))f.set(key,new File(['%PDF-1.7 test'],key+'.pdf',{type:'application/pdf'}));return f;}
test('KYB requires ownership, business details and declaration',()=>{
  const f=form();assert.equal(helpers.parseBusinessDetails(f).buyer_type,'RESELLER');
  f.delete('owners');assert.throws(()=>helpers.parseBusinessDetails(f),/owners/);
  f.set('owners','Owner 100%');f.delete('consent');assert.throws(()=>helpers.parseBusinessDetails(f),/authorized/);
});
test('uploads reject forged MIME, oversized files and unsafe paths',async()=>{
  assert.equal((await helpers.readBusinessFile(new File(['%PDF-1.7'], 'proof.pdf',{type:'application/pdf'}))).mime,'application/pdf');
  await assert.rejects(helpers.readBusinessFile(new File(['<script>'], 'proof.pdf',{type:'application/pdf'})),/valid/);
  await assert.rejects(helpers.readBusinessFile(new File(['%PDF-1.7'], 'proof.png',{type:'image/png'})),/valid/);
  await assert.rejects(helpers.readBusinessFile(new File([new Uint8Array(1048577)], 'proof.pdf',{type:'application/pdf'})),/1 MB/);
  assert.equal(helpers.safeBusinessPath(uid+'/'+other+'.pdf',uid),true);
  assert.equal(helpers.safeBusinessPath(uid+'/../'+other+'.pdf',uid),false);
  assert.equal(helpers.safeBusinessPath(other+'/'+uid+'.pdf',uid),false);
});
function documentHandler({viewer=uid,admin=false,assurance=true,path=uid+'/'+other+'.pdf'}={}) {
  let downloads=0;
  const session={auth:{getUser:async()=>({data:{user:viewer?{id:viewer}:null}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:admin?{user_id:viewer}:null})})};
  const db={from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{user_id:uid,documents:{registration:path},receipt_path:path}})}),storage:{from:()=>({download:async()=>{downloads++;return {data:new Blob(['%PDF-1.7'])};}})}};
  const {GET}=load('app/api/business-documents/route.ts',{'@/lib/supabase/server':{createClient:async()=>session},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/admin-assurance':{hasRequiredAdminAssurance:async()=>assurance},'@/lib/business-verification':helpers});
  return {get:(type='kyb',kind='registration')=>GET({nextUrl:new URL(`https://example.com/api/business-documents?type=${type}&id=${uid}&kind=${kind}`)}),downloads:()=>downloads};
}
test('private documents require owner or MFA-checked admin and never public links',async()=>{
  for(const opts of [{viewer:null},{viewer:other},{viewer:other,admin:true,assurance:false},{path:uid+'/../../secret.pdf'}]){const h=documentHandler(opts);assert.equal((await h.get()).status,404);assert.equal(h.downloads(),0);}
  for(const opts of [{},{viewer:other,admin:true}]){const h=documentHandler(opts);const r=await h.get();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.match(r.headers.get('content-disposition'),/^attachment/);assert.equal(h.downloads(),1);}
  const h=documentHandler();assert.equal((await h.get('kyb','../../secret')).status,404);assert.equal(h.downloads(),0);
  assert.equal((await h.get('deposit')).status,200);
});
test('application action binds ownership to the session, ignoring forged user/status fields',async()=>{
  let captured;let n=1;
  const db={from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:null})}),storage:{from:()=>({upload:async()=>({error:null}),remove:async()=>({error:null})})},rpc:async(name,args)=>{captured={name,args};return {error:null};}};
  const {submitBusinessApplication}=load('app/account/business/actions.ts',{'node:crypto':{randomUUID:()=>`00000000-0000-4000-8000-${String(n++).padStart(12,'0')}`},'next/cache':{revalidatePath(){}},'@/lib/customer-account-data':{requireCustomer:async()=>({user:{id:uid,email_confirmed_at:'2026-09-28'}})},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/business-verification':helpers});
  const f=form();f.set('user_id',other);f.set('status','APPROVED');
  assert.ok((await submitBusinessApplication(f)).success);assert.equal(captured.args.p_user,uid);assert.equal(captured.name,'submit_business_kyb');assert.equal(captured.args.p_details.status,undefined);
  assert.ok(Object.values(captured.args.p_documents).every(path=>helpers.safeBusinessPath(path,uid)));
});
