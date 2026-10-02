const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={},extra={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>{if(n in mocks)return mocks[n];throw Error('Missing '+n)},URL,console,...extra});return exports;}
const policy=load('lib/password-expiry.ts');const nav={redirect:url=>{throw Error('REDIRECT '+url)}};
const statusClient=(required,error=null)=>({rpc:async()=>({data:{required,expires_at:'2027-01-01T00:00:00Z'},error})});
test('password rules require length and all four character classes',()=>{for(const weak of ['Abc1!','abcdefghijkl!1','ABCDEFGHIJK!1','Abcdefghijkl!','Abcdefghijk12','Abcdefghijk1 '])assert.equal(policy.isStrongPassword(weak),false);assert.equal(policy.isStrongPassword('Abcdefghijk1!'),true)});
test('expiry status uses database policy and fails closed on errors or malformed data',async()=>{assert.equal((await policy.getPasswordExpiry(statusClient(true))).required,true);assert.equal((await policy.getPasswordExpiry(statusClient(false))).required,false);for(const c of [statusClient(false,{message:'offline'}),{rpc:async()=>({data:null})},{rpc:async()=>({data:{required:'false'}})}])await assert.rejects(policy.getPasswordExpiry(c),/Unable to verify/);});
test('server action user guard prevents expired access even when action is submitted on a recovery URL',async()=>{for(const required of [true,false]){const raw={...statusClient(required),auth:{getUser:async()=>({data:{user:{id:'user'}},error:null})}};const {createClient}=load('lib/supabase/server.ts',{'next/navigation':nav,'./auth-server':{createClient:async()=>raw},'@/lib/password-expiry':policy});const client=await createClient();if(required)await assert.rejects(client.auth.getUser(),/REDIRECT \/account\/renew-password/);else assert.equal((await client.auth.getUser()).data.user.id,'user');}});
function proxyFor({required=true,user=true,error=null}={}){const client={...statusClient(required,error),auth:{getUser:async()=>({data:{user:user?{id:'user'}:null}})}};const next={next:()=>({kind:'next',cookies:{set(){}}}),redirect:(url,status)=>({kind:'redirect',url:String(url),status,cookies:{set(){}}}),json:(body,opts)=>({kind:'json',body,...opts,cookies:{set(){}}})};return load('proxy.ts',{'@/lib/password-expiry':policy,'@/lib/admin-assurance':{},'@supabase/ssr':{createServerClient:()=>client},'next/server':{NextResponse:next}},{process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture'}}}).proxy;}
const req=path=>({url:'https://fixture.test'+path,headers:{},cookies:{getAll:()=>[],set(){}},nextUrl:{pathname:path,clone:()=>new URL('https://fixture.test'+path)}});
test('expired customers and administrators are redirected, APIs get 403, recovery remains available',async()=>{const proxy=proxyFor();for(const path of ['/account/dashboard','/admin','/checkout','/']){const r=await proxy(req(path));assert.equal(r.kind,'redirect');assert.equal(r.status,303);assert.equal(r.url,'https://fixture.test/account/renew-password');}for(const path of ['/api/orders','/api/admin/invoices']){const r=await proxy(req(path));assert.equal(r.status,403);assert.equal(r.body.code,'PASSWORD_EXPIRED');}for(const path of ['/account/password-verification','/account/renew-password','/account/reset-password','/account/forgot-password','/account/callback','/admin/login','/admin/login/setup','/admin/login/verify'])assert.equal((await proxy(req(path))).kind,'next');assert.equal((await proxyFor({required:false})(req('/account/dashboard'))).kind,'next');assert.equal((await proxyFor({user:false})(req('/api/cron/job'))).kind,'next');assert.equal((await proxyFor({error:{message:'offline'}})(req('/account/dashboard'))).status,503);});
function renewal({admin=false,state='ready',updateError=null}={}){let updates=[],sent=0,signedOut=0;const c={auth:{getUser:async()=>({data:{user:{id:'user'}}}),updateUser:async v=>{updates.push(v);return {error:updateError}},reauthenticate:async()=>{sent++;return {}},signOut:async()=>{signedOut++}},from(){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:admin?{user_id:'user'}:null})}}};const mod=load('app/account/renew-password/actions.ts',{'next/navigation':nav,'@/lib/supabase/auth-server':{createClient:async()=>c},'@/lib/password-expiry':policy,'@/lib/password-mfa':{requirePasswordMfa:async()=>{}},'@/lib/auth-error-message':{getAuthErrorMessage:()=> 'Update failed'},'@/lib/admin-assurance':{getAdminMfaState:async()=>state}});return {...mod,updates,get sent(){return sent},get signedOut(){return signedOut}};}
function form(){const f=new FormData();f.set('current_password','ExistingPassword!1');f.set('password','NewPasswordLong!2');f.set('confirm_password','NewPasswordLong!2');return f;}
test('renewal verifies password fields and MFA, delegates change to Auth and signs out only after success',async()=>{for(const admin of [false,true]){const m=renewal({admin});await assert.rejects(m.renewPassword(form()),new RegExp('REDIRECT '+(admin?'/admin/login':'/account')+'\\?success='));assert.equal(m.updates.length,1);assert.equal(m.updates[0].current_password,'ExistingPassword!1');assert.equal(m.signedOut,1);}for(const state of ['setup','verify','error']){const m=renewal({admin:true,state});await assert.rejects(m.renewPassword(form()));assert.equal(m.updates.length,0);}const m=renewal();const bad=form();bad.set('password','short');await assert.rejects(m.renewPassword(bad));assert.equal(m.updates.length,0);});
test('reauthentication challenge can be requested and passed without resetting the expiry clock on failures',async()=>{const m=renewal({updateError:{code:'reauthentication_needed'}});await assert.rejects(m.renewPassword(form()),/Request%20an%20email/);assert.equal(m.signedOut,0);await assert.rejects(m.sendRenewalCode(),/Check%20your%20email/);assert.equal(m.sent,1);const ok=renewal(),f=form();f.set('verification_code','123456');await assert.rejects(ok.renewPassword(f),/success=/);assert.equal(ok.updates[0].nonce,'123456');});

test('password recovery preserves MFA without forcing passwordless customers to enroll',async()=>{
  for(const target of ['reset','renew'])for(const state of ['ready','setup','verify','error']){
    const m=load('lib/password-mfa.ts',{'next/navigation':nav,'@/lib/admin-assurance':{getAdminMfaState:async()=>state}});
    if(state==='verify')await assert.rejects(m.requirePasswordMfa({},target),new RegExp('password-verification\\?next='+target));
    else if(state==='error')await assert.rejects(m.requirePasswordMfa({},target),/Unable to verify/);
    else await m.requirePasswordMfa({},target);
    assert.equal(m.passwordReturnPath('https://evil.test'),'/account/renew-password');
  }
});

test('password MFA accepts only the signed-in user verified factors and checks final assurance',async()=>{
  for(const scenario of ['ok','anonymous','unverified','foreign','badcode','verifyerror','aal1','factorerror']){
    let challenges=0;
    const client={auth:{getUser:async()=>({data:{user:scenario==='anonymous'?null:{id:'u'}}}),mfa:{
      listFactors:async()=>({error:scenario==='factorerror'?{}:null,data:{totp:[{id:'own',status:scenario==='unverified'?'unverified':'verified'}]}}),
      challengeAndVerify:async()=>{challenges++;return {error:scenario==='verifyerror'?{}:null}},
      getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:scenario==='aal1'?'aal1':'aal2'}})
    }}};
    const m=load('app/account/password-verification/actions.ts',{'next/navigation':nav,'@/lib/supabase/auth-server':{createClient:async()=>client},'@/lib/password-mfa':{passwordReturnPath:t=>t==='reset'?'/account/reset-password':'/account/renew-password'}});
    const f=new FormData();f.set('next','reset');f.set('factor_id',scenario==='foreign'?'another-user':'own');f.set('code',scenario==='badcode'?'abc123456':'123456');
    await assert.rejects(m.verifyPasswordMfa(f),scenario==='ok'?/^Error: REDIRECT \/account\/reset-password$/:/REDIRECT \/account(?:$|\/password-verification\?next=reset&error=)/);
    assert.equal(challenges,['ok','verifyerror','aal1'].includes(scenario)?1:0);
  }
});

test('reset action cannot update passwords before existing MFA is verified',async()=>{
  let updated=0,checked=0;
  const m=load('app/account/actions.ts',{
    'next/headers':{},'next/navigation':nav,'@/lib/password-expiry':policy,
    '@/lib/password-mfa':{requirePasswordMfa:async(_c,target)=>{checked++;assert.equal(target,'reset');nav.redirect('/account/password-verification?next=reset')}},
    '@/lib/customer-login-activity':{},'@/lib/auth-error-message':{},'@/lib/countryCallingCodes':{},'@/lib/supabase/admin':{},
    '@/lib/supabase/auth-server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'u'}}}),updateUser:async()=>{updated++;return {}}}})}
  });
  await assert.rejects(m.updateCustomerPassword(form()),/password-verification/);assert.equal(checked,1);assert.equal(updated,0);
});

test('incorrect current passwords produce actionable errors and never sign out',async()=>{
  for(const code of ['invalid_credentials','current_password_mismatch','current_password_required']){
    const m=renewal({updateError:{code}});await assert.rejects(m.renewPassword(form()),/current%20password/);assert.equal(m.signedOut,0);
  }
});
