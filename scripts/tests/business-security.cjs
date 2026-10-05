const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='server-only'?{}:n in mocks?mocks[n]:require(n),FormData,URL,URLSearchParams,process,console});return exports;}
const ready={approved:true,password_ready:true,totp_ready:true};
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
