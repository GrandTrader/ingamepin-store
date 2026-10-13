const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>n==='server-only'?{}:n in mocks?mocks[n]:require(n),FormData,URL,URLSearchParams,process,console});return exports;}
const ready={approved:true,password_ready:true,totp_ready:true};
test('Authenticator failures distinguish code, setup, session, network and service errors without exposing secrets',()=>{
 const {businessMfaError}=load('lib/business-mfa-error.ts');
 const cases=[
  [{code:'mfa_verification_failed'},/does not match this setup/],
  [{code:'mfa_verification_rejected'},/does not match this setup/],
  [{code:'mfa_factor_not_found'},/setup is no longer active/],
  [{code:'mfa_challenge_expired'},/verification request expired/],
  [{code:'mfa_ip_address_mismatch'},/network connection changed/],
  [{code:'session_expired'},/sign-in session has expired/],
  [{status:401},/sign-in session has expired/],
  [{code:'over_request_rate_limit'},/Too many verification attempts/],
  [{status:429},/Too many verification attempts/],
  [{code:'mfa_totp_verify_not_enabled'},/unavailable on the website/],
  [{code:'mfa_totp_enroll_not_enabled'},/unavailable on the website/],
  [{name:'AuthRetryableFetchError'},/service could not be reached/],
  [{status:503},/service could not be reached/],
  [{code:'unknown'},/Unable to verify/],
 ];
 for(const [error,expected] of cases){const message=businessMfaError({...error,message:'SECRET:code=123456 token=private setup-key=private'});assert.match(message,expected);assert.doesNotMatch(message,/SECRET|123456|token=|setup-key=/);}
 for(const error of [null,undefined,'private error',new Error('private error')])assert.match(businessMfaError(error),/^Unable to verify/);
});
function session({level='aal2',methods=[{method:'totp'}],factor=true,error=null}={}){return {auth:{mfa:{listFactors:async()=>({data:{totp:factor?[{id:'factor',status:'verified'}]:[]},error}),getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:level,currentAuthenticationMethods:methods},error})}}};}
test('Portal access requires approved account, completed password, and current TOTP-verified session',async()=>{
 let state=ready;
 const security=load('lib/business-security.ts',{'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async()=>({data:state})})}});
 assert.equal(await security.businessSessionReady(session(),'u'),true);
 assert.equal(await security.businessSessionReady(session({methods:['mfa/totp']}),'u'),true);
 for(const options of [{level:'aal1'},{methods:['password']},{methods:['phone']},{factor:false}])assert.equal(await security.businessSessionReady(session(options),'u'),false);
 for(const key of Object.keys(ready)){state={...ready,[key]:false};assert.equal(await security.businessSessionReady(session(),'u'),false);}state=ready;
 await assert.rejects(security.businessSessionReady(session({error:{message:'unavailable'}}),'u'),/Unable/);
 state={};await assert.rejects(security.businessSessionReady(session(),'u'),/Unable/);
});
test('Setup email uses the database recipient and a recovery token only in the fragment; failed delivery is reported',async()=>{
 let generated=0,sent,fail=false;
 const db={rpc:async()=>({data:{user_id:'real-user',email:'actual@example.com'}}),auth:{admin:{generateLink:async args=>{generated++;assert.equal(args.email,'actual@example.com');assert.equal(args.type,'recovery');return {data:{properties:{hashed_token:'a'.repeat(64)}}};}}}};
 const mail=load('lib/business-setup-email.ts',{'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/business-security':{businessSecurity:async()=>({...ready,password_ready:false})},'@/lib/email':{sendEmail:async email=>{sent=email;if(fail)throw Error('SMTP unavailable');return {rejected:[]};}}});
 assert.match(await mail.sendBusinessSetupEmail('admin',{email:'input@example.com'}),/Setup email sent/);assert.equal(sent.to,'actual@example.com');assert.match(sent.text,/#token_hash=a{64}/);assert.doesNotMatch(sent.text,/\?token_hash=/);assert.match(sent.html,/Google Authenticator/);
 fail=true;await assert.rejects(mail.sendBusinessSetupEmail('admin',{userId:'real-user'}),/SMTP/);assert.equal(generated,2);
});
test('Email confirmation rejects expired tokens and revoked business access',async()=>{
 let verifies=0,signedOut=0,approved=true,expired=false;
 const client={auth:{verifyOtp:async()=>{verifies++;return expired?{error:{}}:{data:{user:{id:'real'}}};},signOut:async()=>{signedOut++;}}};
 const actions=load('app/account/business/setup/actions.ts',{'next/cache':{},'@/lib/supabase/auth-server':{createClient:async()=>client},'@/lib/business-security':{businessSecurity:async()=>({...ready,approved})},'@/lib/password-expiry':{}});
 assert((await actions.acceptBusinessSetupEmail('bad')).error);assert.equal(verifies,0);
 assert((await actions.acceptBusinessSetupEmail('a'.repeat(64))).success);
 expired=true;assert.match((await actions.acceptBusinessSetupEmail('a'.repeat(64))).error,/expired/);expired=false;approved=false;assert((await actions.acceptBusinessSetupEmail('a'.repeat(64))).error);assert.equal(signedOut,1);
});
test('Password setup cannot bypass an existing factor; MFA verifies only a factor belonging to the session',async()=>{
 let mfa={factors:[{id:'own'}],verified:false},writes=0,challenge=0,approved=true;
 const client={auth:{getUser:async()=>({data:{user:{id:'real',email_confirmed_at:'yes'}}}),updateUser:async()=>{writes++;return{};},mfa:{challengeAndVerify:async({factorId})=>{assert.equal(factorId,'own');challenge++;mfa.verified=true;return{};}}}};
 const actions=load('app/account/business/setup/actions.ts',{'next/cache':{revalidatePath(){}},'@/lib/supabase/auth-server':{createClient:async()=>client},'@/lib/business-security':{businessSecurity:async()=>({...ready,approved}),businessMfaState:async()=>mfa},'@/lib/password-expiry':{isStrongPassword:p=>p==='StrongPassword1!',PASSWORD_RULES:'Strong password required'}});
 const form=new FormData();form.set('password','StrongPassword1!');form.set('confirm_password','StrongPassword1!');
 assert((await actions.setBusinessPassword(form)).error);assert.equal(writes,0);
 form.set('factor_id','forged');form.set('code','123456');assert((await actions.verifyBusinessAuthenticator(form)).error);assert.equal(challenge,0);
 form.set('factor_id','own');assert((await actions.verifyBusinessAuthenticator(form)).success);assert((await actions.setBusinessPassword(form)).success);assert.equal(writes,1);
 approved=false;assert((await actions.setBusinessPassword(form)).error);assert.equal(writes,1);
});

function setupPage({user={id:'own',email:'own@example.invalid',email_confirmed_at:'yes'},error=null,security={...ready,totp_ready:false},mfa={factors:[],verified:false}}={}){
 const element=(type,props)=>({type,props});
 return load('app/account/business/setup/page.tsx',{
  'react/jsx-runtime':{jsx:element,jsxs:element},'next/link':{default:'a'},'next/navigation':{redirect:url=>{throw Error('redirect:'+url)}},
  '@/lib/supabase/auth-server':{createClient:async()=>({auth:{getUser:async()=>({data:{user},error})}})},
  '@/lib/business-security':{businessSecurity:async id=>{assert.equal(id,'own');return security;},businessMfaState:async()=>mfa},
  '@/lib/password-expiry':{},'@/components/BusinessActionForm':{default:'action-form'},'@/components/PasswordInput':{default:'password'},
  './BusinessAuthenticator':{default:'authenticator-setup'},'./actions':{}
 }).default();
}
test('Reopened setup pages require a verified session and approved business account',async()=>{
 for(const options of [{user:null},{user:{id:'own'}},{error:{message:'invalid session'}}])await assert.rejects(setupPage(options),/redirect:\/business\/login\?error=/);
 await assert.rejects(setupPage({security:{...ready,approved:false}}),/^Error: redirect:\/account\/business$/);
});
test('Approved customers with a saved password resume authenticator setup without reusing email tokens',async()=>{
 const page=JSON.stringify(await setupPage());assert.match(page,/Set up Google Authenticator/);assert.match(page,/authenticator-setup/);assert.doesNotMatch(page,/Create your business password/);
 const password=JSON.stringify(await setupPage({security:{...ready,password_ready:false,totp_ready:false}}));assert.match(password,/Create your business password/);
 const verify=JSON.stringify(await setupPage({security:ready,mfa:{factors:[{id:'own-factor'}],verified:false}}));assert.match(verify,/Verify Google Authenticator/);assert.doesNotMatch(verify,/authenticator-setup/);
 await assert.rejects(setupPage({security:ready,mfa:{factors:[{id:'own-factor'}],verified:true}}),/^Error: redirect:\/account\/portal$/);
});
