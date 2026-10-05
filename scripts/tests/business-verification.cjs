const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function load(file,mocks={}) {
  const exports={};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{exports,require:name=>{if(name in mocks)return mocks[name];throw Error('Unexpected module '+name);},File,FormData,Uint8Array,Response,console,Map,Set,URL},{filename:file});return exports;
}
const helpers=load('lib/business-verification.ts',{'./countryCallingCodes':load('lib/countryCallingCodes.ts'),'libphonenumber-js/max':require('libphonenumber-js/max')});
const interest=load('lib/business-interest.ts',{'./countryCallingCodes':load('lib/countryCallingCodes.ts')});
const uid='00000000-0000-4000-8000-000000000010',other='00000000-0000-4000-8000-000000000011';
function form(){const f=new FormData();for(const [key] of helpers.businessFields)f.set(key,'Test business data');f.set('buyer_type','RESELLER');f.set('entity_type','Company');f.set('consent','accepted');for(const [k,v] of Object.entries({country:'India',address_line1:'123 Test Street',address_line2:'Unit 4',city:'Kolkata',state:'West Bengal',postal_code:'700110',phone_country:'India',phone_number:'9999999999',identity_document_type:'Passport',representative_role:'Owner / proprietor'}))f.set(k,v);for(const key of Object.keys(helpers.businessDocumentLabels))f.set(key,new File(['%PDF-1.7 test'],key+'.pdf',{type:'application/pdf'}));return f;}
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
  const db={from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{user_id:uid,documents:{registration:path,identity:path,personal_address:path},receipt_path:path}})}),storage:{from:()=>({download:async()=>{downloads++;return {data:new Blob(['%PDF-1.7'])};}})}};
  const {GET}=load('app/api/business-documents/route.ts',{'@/lib/supabase/server':{createClient:async()=>session},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/admin-assurance':{hasRequiredAdminAssurance:async()=>assurance},'@/lib/business-verification':helpers});
  return {get:(type='kyb',kind='registration')=>GET({nextUrl:new URL(`https://example.com/api/business-documents?type=${type}&id=${uid}&kind=${kind}`)}),downloads:()=>downloads};
}
test('private documents require owner or MFA-checked admin and never public links',async()=>{
  for(const opts of [{viewer:null},{viewer:other},{viewer:other,admin:true,assurance:false},{path:uid+'/../../secret.pdf'}]){const h=documentHandler(opts);assert.equal((await h.get()).status,404);assert.equal(h.downloads(),0);}
  for(const opts of [{},{viewer:other,admin:true}]){const h=documentHandler(opts);const r=await h.get();assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.match(r.headers.get('content-disposition'),/^attachment/);assert.equal(h.downloads(),1);}
  const h=documentHandler();assert.equal((await h.get('kyb','../../secret')).status,404);assert.equal(h.downloads(),0);
  assert.equal((await h.get('deposit')).status,200);assert.equal((await h.get('kyb','identity')).status,200);assert.equal((await h.get('kyb','personal_address')).status,200);const denied=documentHandler({viewer:other});assert.equal((await denied.get('kyb','identity')).status,404);assert.equal(denied.downloads(),0);
});
function interestForm(){const f=new FormData();for(const [key,value] of Object.entries({legal_name:'Test shop',contact_name:'Test owner',country:'India',interest:'BOTH',activity:'Bulk gift cards and ordering API',monthly_volume:'USD 5,000',consent:'accepted'}))f.set(key,value);return f;}
test('Interest submission binds the session and verified email; never uploads documents or grants approval',async()=>{
 let captured;
 const db={rpc:async(name,args)=>{captured={name,args};return {error:null}}};
 const {submitBusinessApplication}=load('app/account/business/actions.ts',{'node:crypto':{},'next/cache':{revalidatePath(){}},'@/lib/customer-account-data':{requireCustomer:async()=>({user:{id:uid,email:'Owner@Example.com',email_confirmed_at:'2026-09-28'}})},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/business-verification':helpers,'@/lib/business-interest':interest});
 const f=interestForm();f.set('user_id',other);f.set('status','APPROVED');f.set('email','attacker@example.com');f.set('verification_method','EMAIL');
 assert.ok((await submitBusinessApplication(f)).success);assert.equal(captured.name,'submit_business_interest');assert.equal(captured.args.p_user,uid);assert.equal(captured.args.p_details.email,'owner@example.com');assert.equal(captured.args.p_details.status,undefined);assert.equal(captured.args.p_details.verification_method,undefined);
 f.set('website','javascript:alert(1)');assert((await submitBusinessApplication(f)).error);
});
test('Interest form validates required fields, allowed countries and contact consent',()=>{
 const f=interestForm();assert.equal(interest.parseBusinessInterest(f).interest,'BOTH');
 for(const [key,bad] of [['interest','APPROVED'],['country','Unknown'],['activity','x'],['monthly_volume','   '],['consent','no']]){const current=f.get(key);f.set(key,bad);assert.throws(()=>interest.parseBusinessInterest(f));f.set(key,current);}
});

test('KYC/KYB details normalize phone, country and structured address',()=>{
 const f=form(),d=helpers.parseBusinessDetails(f);assert.equal(d.phone,'+919999999999');assert.equal(d.phone_country_code,'+91');assert.equal(d.verification_scope,'KYC_AND_KYB');assert.equal(d.address,'123 Test Street\nUnit 4\nKolkata\nWest Bengal\n700110\nIndia');
 f.set('country','Not a country');assert.throws(()=>helpers.parseBusinessDetails(f),/country/);f.set('country','India');f.set('postal_code','123');assert.throws(()=>helpers.parseBusinessDetails(f),/six-digit/);f.set('postal_code','700110');f.set('phone_number','12345');assert.throws(()=>helpers.parseBusinessDetails(f),/valid phone/);f.set('phone_number','9999999999');f.delete('identity_document_type');assert.throws(()=>helpers.parseBusinessDetails(f),/identity document/);
});
test('International addresses may omit postal codes, but India must supply a PIN',()=>{
 const f=form();f.set('postal_code_not_applicable','yes');assert.throws(()=>helpers.parseBusinessDetails(f),/six-digit/);f.set('country','United Arab Emirates');f.set('state','');f.set('phone_country','United Kingdom');f.set('phone_number','020 7946 0018');const d=helpers.parseBusinessDetails(f);assert.equal(d.phone,'+442079460018');assert.equal(d.postal_code,'');assert.equal(d.postal_code_not_applicable,'yes');
});
test('Admin activation requires email review confirmation and uses the authenticated admin',async()=>{
 const calls=[];
 const db={rpc:async(name,args)=>{calls.push({name,args});return {error:null}}};
 const actions=load('app/admin/business-verification/actions.ts',{'next/cache':{revalidatePath(){}},'@/lib/business-verification-data':{requireBusinessAdmin:async()=>({id:other})},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/business-verification':helpers,'@/lib/business-setup-email':{sendBusinessSetupEmail:async()=> 'Setup email sent.'},'@/lib/business-interest':interest,'@/lib/countryCallingCodes':load('lib/countryCallingCodes.ts')});
 const f=new FormData();f.set('email','Owner@Example.com');f.set('legal_name','Test shop');f.set('country','India');f.set('note','Verified through email');f.set('p_admin',uid);
 assert((await actions.createBusinessAccount(f)).error);assert.equal(calls.length,0);
 f.set('checked','yes');assert((await actions.createBusinessAccount(f)).success);assert.equal(calls[0].name,'create_email_business_account');assert.equal(calls[0].args.p_admin,other);assert.equal(calls[0].args.p_email,'owner@example.com');
 f.set('status','APPROVED');f.set('user_id',uid);f.set('revision','4');assert((await actions.reviewBusinessApplication(f)).success);assert.equal(calls[1].args.p_revision,4);assert.equal(calls[1].args.p_confirmed,true);
 f.delete('checked');assert((await actions.reviewBusinessApplication(f)).error);assert.equal(calls.length,2);
});
test('Unverified customers cannot submit interest; unauthenticated admins cannot create accounts',async()=>{
 const app=load('app/account/business/actions.ts',{'node:crypto':{},'next/cache':{},'@/lib/customer-account-data':{requireCustomer:async()=>({user:{id:uid,email:'owner@example.com'}})},'@/lib/supabase/admin':{createAdminClient(){throw Error('Unexpected database access')}},'@/lib/business-verification':helpers,'@/lib/business-interest':interest});
 assert.match((await app.submitBusinessApplication(interestForm())).error,/Verify/);
 const admin=load('app/admin/business-verification/actions.ts',{'next/cache':{},'@/lib/business-verification-data':{requireBusinessAdmin:async()=>{throw Error('Unauthorized')}},'@/lib/supabase/admin':{},'@/lib/business-verification':helpers,'@/lib/business-setup-email':{sendBusinessSetupEmail:async()=> 'Setup email sent.'},'@/lib/business-interest':interest,'@/lib/countryCallingCodes':load('lib/countryCallingCodes.ts')});
 await assert.rejects(admin.createBusinessAccount(new FormData()),/Unauthorized/);await assert.rejects(admin.reviewBusinessApplication(new FormData()),/Unauthorized/);
});
