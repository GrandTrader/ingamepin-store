const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {NextRequest,NextResponse}=require('next/server');
function load(file,mocks){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='server-only'?{}:Object.hasOwn(mocks,n)?mocks[n]:require(n),process:{env:{}},console:{error(){}},Buffer,Date,URL});return exports;}
function accessFixture(browser='signed-browser') { let cookieReads=0;const mod=load('lib/customer-purchase-access.ts',{
 '@/lib/customer-browser-id':{customerBrowserId:async()=>{cookieReads++;return browser}},
 '@/lib/trusted-client-ip':{trustedClientIp:()=> '192.0.2.1'},'@/lib/supabase/admin':{},
 });return {mod,get cookieReads(){return cookieReads}};}
test('context uses signed browser and trusted network data, never request body/forwarded headers',async()=>{
 const f=accessFixture(),request=new Request('https://site.test',{method:'POST',headers:{'x-forwarded-for':'forged'},body:JSON.stringify({browserId:'forged',ip:'forged'})});
 const c=await f.mod.customerPurchaseContext(request);assert.equal(c.browserId,'signed-browser');assert.equal(c.ip,'192.0.2.1');
 const api=await f.mod.customerPurchaseContext(request,true,'203.0.113.1');assert.equal(api.browserId,null);assert.equal(api.ip,'203.0.113.1');assert.equal(f.cookieReads,1);
 await assert.rejects(accessFixture(null).mod.customerPurchaseContext(request),e=>e.status===503);
});
test('purchase checks fail closed, normalize email and do not disclose block keys or reasons',async()=>{
 const {mod}=accessFixture();let args;
 for(const [data,error,status] of [[false,null,403],[null,null,503],[true,{message:'private database error'},503],['true',null,503]]){
  const db={rpc:async(n,a)=>{assert.equal(n,'customer_purchase_access');args=a;return{data,error}}};
  await assert.rejects(mod.assertCustomerPurchaseAccess(db,{browserId:'signed',ip:'192.0.2.1'},{userId:'user',email:' Buyer@Example.Invalid ',bulkClientId:'client'}),e=>e.status===status&&!e.message.includes('private database'));
  assert.equal(args.p_email,'buyer@example.invalid');assert.equal(args.p_user,'user');assert.equal(args.p_browser,'signed');assert.equal(args.p_bulk_client,'client');
 }
 await mod.assertCustomerPurchaseAccess({rpc:async()=>({data:true})},{browserId:null,ip:null},{});
});
test('admin mutations require real membership and MFA, validate input, and bind the acting admin',async()=>{
 const customer='00000000-0000-4000-8000-000000000002';
 for(const condition of ['signed-out','not-admin','no-mfa','invalid','ok']){
  const writes=[],refreshes=[];const user=condition==='signed-out'?null:{id:'real-admin'};
  const session={auth:{getUser:async()=>({data:{user}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:condition==='not-admin'?null:{user_id:'real-admin'}})})};
  const actions=load('app/admin/customers/purchase-access-actions.ts',{
   'next/cache':{revalidatePath:p=>refreshes.push(p)},'@/lib/supabase/admin-session':{createClient:async()=>session},'@/lib/admin-assurance':{hasRequiredAdminAssurance:async()=>condition!=='no-mfa'},
   '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(n,a)=>{writes.push({n,a});return{}}})},
  });
  const form=new FormData();for(const [k,v] of Object.entries({customer_id:customer,admin_id:'forged',action:'restrict',devices:'on',reason:condition==='invalid'?'':'Review'}))form.set(k,v);
  const result=await actions.saveCustomerPurchaseAccess({},form);
  if(condition!=='ok'){assert(result.error);assert.equal(writes.length,0);continue;}
  assert(result.success);assert.equal(writes[0].a.p_admin,'real-admin');assert.equal(writes[0].a.p_devices,true);assert.equal(writes[0].a.p_ips,false);assert.equal(refreshes[0],'/admin/customers/'+customer);
  form.set('action','allow');await actions.saveCustomerPurchaseAccess({},form);assert.equal(writes[1].a.p_enabled,false);
 }
});
test('bulk API rejects blocked owner before reserving idempotency or creating an order',async()=>{
 const f=accessFixture(),writes=[],identities=[];const q={select(){return this},eq(){return this},maybeSingle:async()=>({data:null})};
 const route=load('app/api/v1/bulk/orders/route.ts',{
 'next/server':{NextRequest},'@/lib/customer-purchase-access':{...f.mod,customerPurchaseContext:async()=>({browserId:null,ip:'192.0.2.1'}),assertCustomerPurchaseAccess:async(_db,_ctx,identity)=>{identities.push(identity);throw new f.mod.CustomerPurchaseAccessError('Restricted',403)}},
 '@/lib/bulk-api-auth':{authorizeBulkApi:async()=>({principal:{clientId:'real-client'}}),bulkApiNoStore:(b,o={})=>NextResponse.json(b,o)},
 '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>q,rpc:async(...a)=>writes.push(a)})},'@/lib/manual-usdt':{MANUAL_USDT_NETWORKS:[]},'@/lib/trusted-client-ip':{trustedClientIp:()=> '192.0.2.1'},
 });
 const r=await route.POST(new NextRequest('https://shop.test/api/v1/bulk/orders',{method:'POST',headers:{'idempotency-key':'test-request'},body:JSON.stringify({customer:{name:'Test',email:'other@example.invalid'},clientId:'forged',items:[{productOptionId:'00000000-0000-4000-8000-000000000010',quantity:1}]})}));
 assert.equal(r.status,403);assert.equal(writes.length,0);assert.equal(identities[0].bulkClientId,'real-client');
});
test('PayPal create checks restrictions; confirmation of an authorized payment still completes',async()=>{
 const {mod}=accessFixture();let created=0,confirmed=0;
 const route=load('app/api/paypal/checkout/route.ts',{
 '@/lib/customer-purchase-access':{...mod,customerPurchaseContext:async()=>({browserId:'known',ip:null}),assertCustomerPurchaseAccess:async()=>{throw new mod.CustomerPurchaseAccessError('Restricted',403)}},
 '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({select(){return this},eq(){return this},single:async()=>({data:{customer_id:'buyer',customer_email:'buyer@example.invalid'}})})})},
 '@/lib/paypal-checkout':{authorizePayPalOrder:async()=> 'order',createPayPalCheckout:async()=>{created++},confirmPayPalCheckout:async()=>{confirmed++;return{status:'COMPLETED'}}},
 '@/lib/paypal-request-origin':{paypalRequestOrigin:()=> 'https://site.test'},'@/lib/paypal-webhook':{readPayPalBody:r=>r.text()},'@/lib/paypal-notifications':{finishPayPalOrder:async()=>{}},'@/lib/request-security':{consumeRate:async()=>true,privateJson:(b,s=200)=>NextResponse.json(b,{status:s})},
 });
 for(const action of ['create','confirm']){const r=await route.POST(new Request('https://site.test',{method:'POST',body:JSON.stringify({action,paypalOrderId:'REFERENCE12345'})}));assert.equal(r.status,action==='create'?403:200);}
 assert.equal(created,0);assert.equal(confirmed,1);
});
