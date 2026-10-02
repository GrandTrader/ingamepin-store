const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX}}).outputText;
  vm.runInNewContext(js, {exports, require: n => {if(n in mocks) return mocks[n]; throw Error('Unexpected import '+n);}, console, ...globals}, {filename:file});
  return exports;
}
const helpers = load('lib/admin-assurance.ts');
const verified = [{status:'verified', factor_type:'totp', id:'factor'}];
function client({level='aal1', factors=[], admin=true, user=true, error=null}={}) {
  return {auth:{
    getUser:async()=>({data:{user:user?{id:'admin',email:'admin@example.test'}:null}}),
    signOut:async()=>{}, signInWithPassword:async()=>({data:{user:{id:'admin'}}}),
    mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:level},error}),listFactors:async()=>({data:{all:factors,totp:factors},error})}
  },from(){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:admin?{user_id:'admin',role:'OWNER'}:null})};}};
}
const redirects = {redirect:url=>{throw Error('REDIRECT '+url);}};
const render = {jsx:(type,props)=>({type,props}),jsxs:(type,props)=>({type,props})};

test('admin MFA requires a verified factor and AAL2; stale tokens and service failures are rejected',async()=>{
  for(const [config,state] of [[{},'setup'],[{level:'aal2'},'setup'],[{factors:[{status:'unverified'}]},'setup'],[{factors:verified},'verify'],[{level:'aal2',factors:verified},'ready'],[{error:{message:'offline'}},'error']]) {
    assert.equal(await helpers.getAdminMfaState(client(config)),state);
    assert.equal(await helpers.hasRequiredAdminAssurance(client(config)),state==='ready');
  }
  const broken=client();broken.auth.mfa.listFactors=async()=>{throw Error('offline');};assert.equal(await helpers.getAdminMfaState(broken),'error');
});

test('password login routes administrators to enrollment, verification or dashboard',async()=>{
  for(const [config,target] of [[{},'/admin/login/setup'],[{factors:verified},'/admin/login/verify'],[{factors:verified,level:'aal2'},'/admin'],[{admin:false},'/admin/login?error='],[{error:{message:'offline'}},'/admin/login?error=']]) {
    const session=client(config);
    const {adminLogin}=load('app/admin/actions.ts',{'@/lib/admin-assurance':helpers,'next/navigation':redirects,'@/lib/auth-error-message':{},'@/lib/email':{},'@/lib/supabase/server':{createClient:async()=>session}});
    const form=new FormData();form.set('email','admin@example.test');form.set('password','fixture');form.set('captcha_token','fixture');
    await assert.rejects(adminLogin(form),e=>e.message.startsWith('REDIRECT '+target));
  }
});

function page(file, session) {
  const source=fs.readFileSync(file,'utf8');const mocks=Object.fromEntries([...source.matchAll(/from\s+"([^"]+)"/g)].map(m=>[m[1],{}]));
  return load(file,{...mocks,'react/jsx-runtime':render,'next/navigation':redirects,'@/lib/admin-assurance':helpers,'@/lib/supabase/server':{createClient:async()=>session}}).default;
}
test('login and verify pages route missing factors to setup even with a stale AAL2 token',async()=>{
  for(const file of ['app/admin/login/page.tsx','app/admin/login/verify/page.tsx']) {
    await assert.rejects(page(file,client({level:'aal2'}))({searchParams:Promise.resolve({})}),/REDIRECT \/admin\/login\/setup$/);
    await assert.rejects(page(file,client({error:{message:'offline'}}))({searchParams:Promise.resolve({})}),/Unable to verify/);
    await assert.rejects(page(file,client({factors:verified,level:'aal2'}))({searchParams:Promise.resolve({})}),/REDIRECT \/admin$/);
  }
});
test('setup remains available to password-only admins and does not loop with enrolled accounts',async()=>{
  const file='app/admin/login/setup/page.tsx';
  assert.ok(await page(file,client())());
  await assert.rejects(page(file,client({factors:verified}))(),/REDIRECT \/admin\/login\/verify$/);
  await assert.rejects(page(file,client({level:'aal2',factors:verified}))(),/REDIRECT \/admin$/);
  await assert.rejects(page(file,client({admin:false}))(),/Access denied/);
});

test('legacy disable action cannot remove any factor',async()=>{
  const session=client({factors:verified,level:'aal2'});let removed=0;
  session.auth.mfa.unenroll=async()=>{removed++;return {};};
  const {disableAdminMfa}=load('app/admin/security/actions.ts',{'next/navigation':redirects,'@/lib/supabase/admin-session':{createClient:async()=>session}});
  await assert.rejects(disableAdminMfa(),/cannot%20be%20turned%20off/);assert.equal(removed,0);
});

test('proxy blocks unenrolled admin pages and APIs but preserves customer and setup access',async()=>{
  const next={next:()=>({kind:'next',cookies:{set(){}}}),redirect:url=>({kind:'redirect',url,cookies:{set(){}}}),json:(body,opts)=>({kind:'json',status:opts.status,body})};
  for(const [path,config,kind,status] of [['/admin',{},'redirect'],['/api/admin/invoices',{},'json',403],['/api/admin/invoices',{user:false},'json',401],['/admin/login/setup',{},'next'],['/account',{},'next'],['/admin',{level:'aal2',factors:verified},'next'],['/admin',{level:'aal2'},'redirect']]) {
    const session=client(config);const {proxy}=load('proxy.ts',{'@/lib/admin-assurance':helpers,'@supabase/ssr':{createServerClient:()=>session},'next/server':{NextResponse:next}},{process:{env:{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.test',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture'}}});
    const result=await proxy({headers:{},cookies:{getAll:()=>[],set(){}},nextUrl:{pathname:path,clone:()=>new URL('https://fixture.test'+path)}});
    assert.equal(result.kind,kind,path);if(status)assert.equal(result.status,status);
  }
});
