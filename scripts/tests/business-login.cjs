const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,deps){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>{if(n in deps)return deps[n];throw Error('Unmocked '+n);}});return exports;}
const redirect=p=>{throw Error('redirect:'+p)};
function harness(fail=false){const calls=[];const deps={
 '@/lib/password-mfa':{},'next/headers':{headers:async()=>({})},'@/lib/password-expiry':{},'next/navigation':{redirect},
 '@/lib/customer-login-activity':{getCountryCode:()=>null,recordCustomerLogin:async()=>{}},
 '@/lib/auth-error-message':{getAuthErrorMessage:()=> 'Invalid credentials'},'@/lib/countryCallingCodes':{},'@/lib/supabase/admin':{},
 '@/lib/supabase/auth-server':{createClient:async()=>({auth:{signInWithPassword:async args=>{calls.push(args);return fail?{error:{},data:{user:null}}:{error:null,data:{user:{id:'test'}}};}}})}
 };return {api:load('app/account/actions.ts',deps),calls};}
function form(extra={}){const f=new FormData();for(const[k,v]of Object.entries({email:'TEST@example.com',password:'example-password',captcha_token:'test-captcha',login_area:'business',...extra}))f.set(k,v);return f;}
test('B2B login requires captcha and preserves errors on B2B login',async()=>{const {api,calls}=harness();await assert.rejects(api.customerLogin(form({captcha_token:''})),/redirect:\/business\/login\?error=/);assert.equal(calls.length,0);const denied=harness(true);await assert.rejects(denied.api.customerLogin(form()),/redirect:\/business\/login\?error=Invalid/);});
test('B2B login returns to the approval gate and forwards captcha to authentication',async()=>{const {api,calls}=harness();await assert.rejects(api.customerLogin(form()),/^Error: redirect:\/business\/login$/);assert.equal(calls[0].options.captchaToken,'test-captcha');assert.equal(calls[0].email,'test@example.com');});
test('retail login and untrusted destinations use retail dashboard',async()=>{for(const area of ['','https://evil.test']){const {api}=harness();await assert.rejects(api.customerLogin(form({login_area:area})),/^Error: redirect:\/account\/dashboard$/);}});
function portalHarness(user,approved,ready){return load('lib/business-portal-data.ts',{
 'server-only':{},'@/lib/business-security':{businessSessionReady:async()=>ready},react:{cache:f=>f},'next/cache':{unstable_cache:f=>f},'next/navigation':{redirect},
 '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user}})}})},'@/lib/supabase/admin':{},'./business-verification-data':{businessApplication:async()=>({status:approved?'APPROVED':'PENDING'})},'./business-portal':{}
 });}
test('portal still requires verified account, approval and completed MFA',async()=>{const user={id:'test',email:'test@example.com',email_confirmed_at:'today'};
 await assert.rejects(portalHarness(null,false,false).portalCustomer(),/redirect:\/business\/login/);
 await assert.rejects(portalHarness(user,false,false).portalCustomer(),/^Error: redirect:\/business\/login$/);
 await assert.rejects(portalHarness(user,true,false).portalCustomer(),/redirect:\/account\/business\/setup/);
 assert.equal((await portalHarness(user,true,true).portalCustomer()).user.id,'test');
});

function loginPageHarness(status, signedIn=true) {
 const element=(type,props)=>({type,props});
 return load('app/business/login/page.tsx',{
  'react/jsx-runtime':{jsx:element,jsxs:element}, 'next/link':{default:'a'},'next/navigation':{redirect},
  '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:signedIn?{id:'customer',email:'customer@example.test',email_confirmed_at:'today'}:null}})}})},
  '@/lib/business-verification-data':{businessApplication:async()=>status?{status}:null},
  '@/components/AuthSubmitButton':{default:'submit'},'@/components/PasswordInput':{default:'password'},'@/components/RegistrationTurnstile':{default:'captcha'},'@/app/account/actions':{customerLogin(){}},'./Login.module.css':{default:{}}
 }).default;
}
test('signed-in retail and unapproved customers see B2B message without redirect loops',async()=>{
 for(const status of [null,'PENDING','REJECTED','REVOKED']) {
  const rendered=JSON.stringify(await loginPageHarness(status)({searchParams:Promise.resolve({})}));
  assert.ok(rendered.includes('You are not registered for the B2B Portal.'));
  assert.ok(rendered.includes('Send an enquiry'));
  assert.ok(rendered.includes('customer@example.test'));
 }
});
test('approved B2B customers continue to secured portal; guests see normal login',async()=>{
 await assert.rejects(loginPageHarness('APPROVED')({searchParams:Promise.resolve({})}),/^Error: redirect:\/account\/portal$/);
 const rendered=JSON.stringify(await loginPageHarness(null,false)({searchParams:Promise.resolve({})}));
 assert.ok(!rendered.includes('You are not registered'));
 assert.ok(rendered.includes('login_area'));
});
