const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const crypto=require('node:crypto');
function load(file,mocks,globals={}) {
 const exports={};
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(js,{exports,Buffer,AbortSignal,console,URL,require:name=>{if(name in mocks)return mocks[name];throw Error('Unexpected dependency '+name)},...globals});
 return exports;
}
function fixture({approvalUrl='https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T',approvalMethod='GET'}={}) {
 const env={PAYPAL_ENVIRONMENT:'sandbox',PAYPAL_CLIENT_ID:'fixture-client',PAYPAL_CLIENT_SECRET:'fixture-secret'};
 const calls=[]; let current; let clock=Date.now();
 const client=load('lib/paypal.ts',{'server-only':{}},{process:{env},fetch:async(url,options)=>{
  calls.push({url,options});
  assert(url.startsWith('https://api-m.sandbox.paypal.com/'));
  assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');
  if(url.endsWith('/oauth2/token'))return Response.json({access_token:'fixture-access-token'});
  if(url.endsWith('/orders') && options.method==='POST') {
   const body=JSON.parse(options.body);
   current={id:'5O190127TN364715T',intent:body.intent,status:'CREATED',links:[{rel:'payer-action',method:approvalMethod,href:approvalUrl}],purchase_units:body.purchase_units.map(u=>({...u,payee:{merchant_id:'MERCHANTFIXTURE'}}))};
   return Response.json(current);
  }
  if(url.endsWith('/capture')) {
   current.status='COMPLETED';
   current.purchase_units[0].payments={captures:[{id:'8MC585209K746392H',status:'COMPLETED',final_capture:true,amount:{currency_code:'USD',value:'1.00'}}]};
  }
  return Response.json(current);
 }});
 class Clock extends Date {static now(){return clock}}
 const sandbox=load('lib/paypal-sandbox.ts',{'server-only':{},'node:crypto':crypto,'@/lib/paypal':client},{Date:Clock});
 return {env,calls,client,sandbox,order:()=>current,advance:()=>{clock+=31*60*1000}};
}
test('Sandbox uses a server-set USD test amount and a separate authenticated admin session',async()=>{
 const f=fixture();const created=await f.sandbox.createPayPalSandboxOrder('admin-1','http://retail.localhost:3002');
 const body=JSON.parse(f.calls.find(c=>c.url.endsWith('/orders')).options.body);
 assert.equal(body.purchase_units[0].amount.value,'1.00');assert.equal(body.purchase_units[0].amount.currency_code,'USD');
 assert.equal(body.payment_source.paypal.experience_context.shipping_preference,'NO_SHIPPING');
 assert.equal(body.payment_source.paypal.experience_context.return_url,'http://retail.localhost:3002/admin/payment-settings/paypal?paypal=approved');
 assert.equal(body.payment_source.paypal.experience_context.cancel_url,'http://retail.localhost:3002/admin/payment-settings/paypal?paypal=cancelled');
 assert(created.sessionToken && !created.sessionToken.includes('fixture-secret'));
 const previous=f.calls.length;
 await assert.rejects(f.sandbox.capturePayPalSandboxOrder(created.sessionToken,'admin-2'));
 await assert.rejects(f.sandbox.capturePayPalSandboxOrder(created.sessionToken+'tampered','admin-1'));
 assert.equal(f.calls.length,previous);
});
test('hosted checkout refuses unsafe approval links and return origins',async()=>{
 for(const approvalUrl of ['https://attacker.invalid/checkoutnow?token=5O190127TN364715T','https://www.paypal.com/checkoutnow?token=5O190127TN364715T','http://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T','https://user@www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T','https://www.sandbox.paypal.com/checkoutnow?token=DIFFERENTORDER']) {
  await assert.rejects(fixture({approvalUrl}).sandbox.createPayPalSandboxOrder('admin','http://retail.localhost:3002'),/valid Sandbox checkout link/);
 }
 await assert.rejects(fixture({approvalMethod:'POST'}).sandbox.createPayPalSandboxOrder('admin','http://retail.localhost:3002'),/valid Sandbox checkout link/);
 for(const origin of ['http://shop.example','https://shop.example/other','https://shop.example?return=evil','https://user@shop.example']) {const f=fixture();await assert.rejects(f.sandbox.createPayPalSandboxOrder('admin',origin),/return origin/);assert.equal(f.calls.length,0);}
});
test('expired and live-mode test sessions fail before any PayPal request',async()=>{
 const f=fixture();const created=await f.sandbox.createPayPalSandboxOrder('admin','http://retail.localhost:3002');const before=f.calls.length;
 f.advance();await assert.rejects(f.sandbox.capturePayPalSandboxOrder(created.sessionToken,'admin'));
 f.env.PAYPAL_ENVIRONMENT='live';await assert.rejects(f.sandbox.createPayPalSandboxOrder('admin','http://retail.localhost:3002'),/only supports PayPal Sandbox/);
 await assert.rejects(f.sandbox.capturePayPalSandboxOrder(created.sessionToken,'admin'));
 assert.equal(f.calls.length,before);
});
test('approval is not payment; the server verifies capture and retries do not capture twice',async()=>{
 const f=fixture();const created=await f.sandbox.createPayPalSandboxOrder('admin','http://retail.localhost:3002');
 await assert.rejects(f.sandbox.capturePayPalSandboxOrder(created.sessionToken,'admin'),/not confirmed/);
 assert.equal(f.calls.filter(c=>c.url.endsWith('/capture')).length,0);
 f.order().status='APPROVED';
 const paid=await f.sandbox.capturePayPalSandboxOrder(created.sessionToken,'admin');
 assert.equal(paid.status,'COMPLETED');assert.equal(paid.environment,'sandbox');assert.equal(paid.amount,'1.00');
 const again=await f.sandbox.capturePayPalSandboxOrder(created.sessionToken,'admin');assert.equal(again.captureId,paid.captureId);
 const captures=f.calls.filter(c=>c.url.endsWith('/capture'));assert.equal(captures.length,1);assert.equal(captures[0].options.headers['PayPal-Request-Id'],'IGP-TEST-CAPTURE-'+created.orderId);
});
test('mismatched order, total, currency, merchant and reference are refused before capture',async()=>{
 const changes=[o=>{o.id='9AAAAAAAAAAAAAAAA'},o=>{o.intent='AUTHORIZE'},o=>{o.purchase_units[0].amount.value='0.01'},o=>{o.purchase_units[0].amount.currency_code='EUR'},o=>{o.purchase_units[0].custom_id='another-order'},o=>{o.purchase_units[0].payee.merchant_id='OTHER-MERCHANT'},o=>{o.purchase_units.push(o.purchase_units[0])}];
 for(const change of changes){const f=fixture();const created=await f.sandbox.createPayPalSandboxOrder('admin','http://retail.localhost:3002');f.order().status='APPROVED';change(f.order());await assert.rejects(f.sandbox.capturePayPalSandboxOrder(created.sessionToken,'admin'),/could not be verified/);assert.equal(f.calls.filter(c=>c.url.endsWith('/capture')).length,0);}
});
test('pending, partial, wrong-currency and duplicate captures never report success',async()=>{
 for(const change of [c=>{c.status='PENDING'},c=>{c.amount.value='0.50'},c=>{c.amount.currency_code='EUR'},c=>{c.final_capture=false},c=>{delete c.id}]) {
  const f=fixture();const created=await f.sandbox.createPayPalSandboxOrder('admin','http://retail.localhost:3002');f.order().status='APPROVED';await f.sandbox.capturePayPalSandboxOrder(created.sessionToken,'admin');change(f.order().purchase_units[0].payments.captures[0]);
  await assert.rejects(f.sandbox.capturePayPalSandboxOrder(created.sessionToken,'admin'),/not confirmed/);
 }
});
test('API client refuses unknown environments and arbitrary URLs and keeps upstream errors private',async()=>{
 const f=fixture();await assert.rejects(f.client.paypalRequest('https://attacker.invalid','GET'),/Invalid PayPal endpoint/);
 await assert.rejects(f.client.paypalRequest('/v2/checkout/orders','POST',{}),/idempotency/);assert.equal(f.calls.length,0);
 f.env.PAYPAL_ENVIRONMENT='mistyped';await assert.rejects(f.client.paypalRequest('/v2/checkout/orders','POST',{},'request-id'),/not configured/);
 const client=load('lib/paypal.ts',{'server-only':{}},{process:{env:{...f.env,PAYPAL_ENVIRONMENT:'sandbox'}},fetch:async()=>Response.json({error:'PRIVATE-CREDENTIAL',payer:'private@example.invalid'},{status:401})});
 await assert.rejects(client.paypalRequest('/v2/checkout/orders','POST',{},'request-id'),error=>error.code==='AUTHENTICATION_FAILED' && !error.message.includes('PRIVATE') && !error.message.includes('@'));
});
function routeFixture(options={}) {
 let created=0,captured=0;
 const user=options.signedOut?null:{id:'admin'};
 const client={auth:{getUser:async()=>({data:{user}})},from:table=>{assert.equal(table,'admin_users');const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:options.notAdmin?null:{user_id:'admin'}})};return q}};
 const originHelper=load('lib/paypal-request-origin.ts',{'server-only':{}},{process:{env:options.env||{NODE_ENV:'production'}}});
 const route=load('app/api/admin/paypal/sandbox/route.ts',{'next/server':{},'@/lib/paypal-request-origin':originHelper,'@/lib/supabase/server':{createClient:async()=>client},'@/lib/admin-assurance':{hasRequiredAdminAssurance:async()=>!options.noMfa},'@/lib/request-security':{privateJson:(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}}),consumeRate:async()=>!options.limited},'@/lib/paypal-sandbox':{paypalSandboxConfiguration:()=>{if(options.live)throw Error('Live disabled')},createPayPalSandboxOrder:async(id,returnOrigin)=>{assert.equal(id,'admin');assert.equal(returnOrigin,options.expectedOrigin||'https://shop.example');created++;return {orderId:'TEST',sessionToken:'SIGNED'}},capturePayPalSandboxOrder:async(token,id)=>{assert.equal(id,'admin');assert.equal(token,'SIGNED');captured++;return {status:'COMPLETED',environment:'sandbox'}}}},{URL});
 return {post:(body={action:'create'},origin='https://shop.example',request={})=>route.POST(new Request(request.url||'https://shop.example/api/admin/paypal/sandbox',{method:'POST',headers:{...(origin?{origin}:{}),...request.headers},body:JSON.stringify(body)})),counts:()=>({created,captured})};
}
test('Sandbox route denies cross-site, unauthenticated, non-admin, missing MFA and rate-limited requests',async()=>{
 for(const [options,status] of [[{signedOut:true},401],[{notAdmin:true},403],[{noMfa:true},401],[{limited:true},429],[{live:true},502]]){const f=routeFixture(options);assert.equal((await f.post()).status,status);assert.deepEqual(f.counts(),{created:0,captured:0});}
 for(const origin of ['https://attacker.invalid',null]) {const f=routeFixture();assert.equal((await f.post(undefined,origin)).status,403);assert.deepEqual(f.counts(),{created:0,captured:0});}
});
test('authenticated Sandbox route permits tests only and returns private responses',async()=>{
 const f=routeFixture();const created=await f.post();assert.equal(created.status,200);assert.equal(created.headers.get('cache-control'),'private, no-store');
 assert.equal((await f.post({action:'capture',sessionToken:'SIGNED'})).status,200);
 assert.equal((await f.post({action:'fulfill',orderId:'REAL-ORDER'})).status,400);
 assert.deepEqual(f.counts(),{created:1,captured:1});
});

test('local preview accepts the configured retail host despite Next bind-address normalization and keeps return URL on retail',async()=>{
 const origin='http://retail.localhost:3002';
 const f=routeFixture({env:{NODE_ENV:'development',NEXT_PUBLIC_RETAIL_SITE_URL:origin},expectedOrigin:origin});
 const request={url:'http://127.0.0.1:3002/api/admin/paypal/sandbox',headers:{host:'retail.localhost:3002','sec-fetch-site':'same-origin'}};
 assert.equal((await f.post(undefined,origin,request)).status,200);
 assert.equal((await f.post({action:'capture',sessionToken:'SIGNED'},origin,request)).status,200);
 assert.deepEqual(f.counts(),{created:1,captured:1});
});

test('local origin exception rejects other hosts, ports, protocols, forwarded-header spoofing and production requests',async()=>{
 const origin='http://retail.localhost:3002';const dev={NODE_ENV:'development',NEXT_PUBLIC_RETAIL_SITE_URL:origin};
 const base={url:'http://127.0.0.1:3002/api/admin/paypal/sandbox',headers:{host:'retail.localhost:3002','sec-fetch-site':'same-origin'}};
 const cases=[
  {origin:null},{origin:'null'},{origin:'https://attacker.invalid'},{origin:'http://other.localhost:3002'},
  {origin:'http://localhost:3002'},{origin:'http://retail.localhost:3003'},{origin:'https://retail.localhost:3002'},
  {headers:{host:'other.localhost:3002'}},{headers:{host:'127.0.0.1:3002','x-forwarded-host':'retail.localhost:3002'}},
  {headers:{host:'retail.localhost:3002','sec-fetch-site':'cross-site'}},
  {env:{...dev,NODE_ENV:'production'}},{env:{NODE_ENV:'development'}},
  {env:{...dev,NEXT_PUBLIC_RETAIL_SITE_URL:'http://retail.localhost:3002/path'}},
  {url:'http://127.0.0.1:3003/api/admin/paypal/sandbox'},
 ];
 for(const candidate of cases){const f=routeFixture({env:candidate.env||dev});const request={url:candidate.url||base.url,headers:{...base.headers,...candidate.headers}};assert.equal((await f.post(undefined,'origin'in candidate?candidate.origin:origin,request)).status,403);assert.deepEqual(f.counts(),{created:0,captured:0});}
 const production=routeFixture();assert.equal((await production.post(undefined,'https://shop.example',{headers:{host:'shop.example','sec-fetch-site':'same-origin'}})).status,200);
});
