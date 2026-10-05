const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,require:n=>n in mocks?mocks[n]:require(n),URL,FormData,console});return exports;}
const countries=load('lib/countryCallingCodes.ts'),interest=load('lib/business-interest.ts',{'./countryCallingCodes':countries});
(async()=>{
 for(const status of [null,'PENDING','APPROVED','REVOKED']){
  const user=status?{id:'customer',email_confirmed_at:'2026-01-01'}:null;
  const page=load('app/business/page.tsx',{'next/link':()=>null,'next/navigation':{redirect:p=>{throw Error('REDIRECT:'+p)}},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user}})}})},'@/lib/business-verification-data':{businessApplication:async()=>({status})},'@/app/account/business/BusinessInterestForm':()=>null,'./actions':{submitGuestBusinessEnquiry:async()=>({})}}).default;
  if(!status)assert(await page());else await assert.rejects(page(),new RegExp(status==='APPROVED'?'REDIRECT:/account/portal':'REDIRECT:/account/business'));
 }
 let sends=0,allowed=true,mail=null;
 const action=load('app/business/actions.ts',{'next/headers':{headers:async()=>({})},'@/lib/business-interest':interest,'@/lib/request-security':{consumeRate:async()=>allowed},'@/lib/trusted-client-ip':{trustedClientIp:()=> '203.0.113.10'},'@/lib/email':{sendEmail:async value=>{sends++;mail=value;return {rejected:[]}}}}).submitGuestBusinessEnquiry;
 const f=new FormData();for(const[k,v]of Object.entries({email:'buyer@example.com',legal_name:'Example shop',contact_name:'Example Person',country:'India',interest:'BOTH',activity:'Digital gift card resale',monthly_volume:'USD 5000',consent:'accepted'}))f.set(k,v);
 assert((await action(f)).success);assert.equal(sends,1);assert.equal(mail.to,'amang@ingamepin.com');assert.equal(mail.replyTo,'buyer@example.com');assert(mail.text.includes('USD 5000'));
 allowed=false;assert((await action(f)).error);assert.equal(sends,1);allowed=true;f.set('email','bad\r\nCc: attacker@example.com');assert((await action(f)).error);assert.equal(sends,1);f.set('company_site','spam');assert((await action(f)).success);assert.equal(sends,1);
 console.log('PASS: guest enquiry page, approved/pending/revoked routing, enquiry validation, fixed internal recipient, rate limits and spam trap. No real emails sent.');
})().catch(e=>{console.error(e);process.exitCode=1});
