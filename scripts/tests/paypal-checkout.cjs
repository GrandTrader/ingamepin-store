const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const oid='11111111-1111-4111-8111-111111111111',pid='22222222-2222-4222-8222-222222222222';
const paypalId='5O190127TN364715T',merchant='MERCHANTFIXTURE',captureId='8MC585209K746392H';
function load(file,mocks,globals={}) {
  const exports={};
  const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(js,{exports,Buffer,AbortSignal,console,URL,Date,require:name=>{if(name in mocks)return mocks[name];throw Error('Unexpected dependency '+name)},...globals});
  return exports;
}
function fixture() {
  const env={PAYPAL_ENVIRONMENT:'live',PAYPAL_WEBHOOK_ID:'WEBHOOKFIXTURE',PAYPAL_CHECKOUT_ENABLED:'true'};
  const checkout={order_id:oid,payment_id:pid,request_id:'33333333-3333-4333-8333-333333333333',amount:'12.34',currency:'USD',return_origin:'https://shop.example',paypal_order_id:paypalId,merchant_id:merchant,created_at:new Date().toISOString()};
  const order={id:paypalId,intent:'CAPTURE',status:'APPROVED',purchase_units:[{reference_id:oid,custom_id:oid,amount:{currency_code:'USD',value:'12.34'},payee:{merchant_id:merchant}}],links:[{rel:'payer-action',method:'GET',href:`https://www.paypal.com/checkoutnow?token=${paypalId}`}]};
  const calls=[];
  let captures=0,completed=0;
  const admin={from(table){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:table==='paypal_checkouts'?checkout:table==='payment_gateway_settings'?{gateway_commissions:{PAYPAL:{enabled:true}}}:{id:oid,access_token_hash:crypto.createHash('sha256').update('a'.repeat(43)).digest('hex')}})};return q;},async rpc(name,args){calls.push({name,args});if(name==='complete_paypal_checkout')completed++;return {data:name==='begin_paypal_checkout'?checkout:true}}};
  const request=async(path,method,body,id)=>{
    calls.push({path,method,body,id});
    if(path.endsWith('/capture')){captures++;order.status='COMPLETED';order.purchase_units[0].payments={captures:[{id:captureId,status:'COMPLETED',final_capture:true,amount:{currency_code:'USD',value:'12.34'}}]};}
    return order;
  };
  const service=load('lib/paypal-checkout.ts',{'server-only':{},'node:crypto':crypto,'@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/paypal':{getPayPalConfiguration:()=>({environment:env.PAYPAL_ENVIRONMENT}),paypalRequest:request}},{process:{env}});
  return {env,checkout,order,calls,service,counts:()=>({captures,completed})};
}
test('customer checkout fails closed for Sandbox, incomplete setup and disabled activation',async()=>{
  const f=fixture();f.env.PAYPAL_ENVIRONMENT='sandbox';assert.equal(await f.service.paypalCheckoutAvailable(),false);await assert.rejects(f.service.confirmPayPalCheckout(oid));assert.equal(f.calls.length,0);
  f.env.PAYPAL_ENVIRONMENT='live';delete f.env.PAYPAL_WEBHOOK_ID;assert.equal(await f.service.paypalCheckoutAvailable(),false);
  f.env.PAYPAL_WEBHOOK_ID='WEBHOOKFIXTURE';delete f.env.PAYPAL_CHECKOUT_ENABLED;assert.equal(await f.service.paypalCheckoutAvailable(),false);
});
test('order access requires the exact secret token and rejects malformed references',async()=>{
  const f=fixture();assert.equal(await f.service.authorizePayPalOrder(oid,'a'.repeat(43)),oid);
  for(const [id,token] of [[oid,'b'.repeat(43)],['invalid','a'.repeat(43)],[oid,'short'],[oid,{}]])await assert.rejects(f.service.authorizePayPalOrder(id,token));
});
test('new checkout uses stored USD amount and the same durable idempotency key',async()=>{
  const f=fixture();f.checkout.paypal_order_id=null;f.checkout.merchant_id=null;f.order.status='CREATED';
  for(let n=0;n<2;n++)assert.match((await f.service.createPayPalCheckout(oid,'https://shop.example')).checkoutUrl,/paypal.com/);
  const requests=f.calls.filter(c=>c.path==='/v2/checkout/orders');assert.equal(requests.length,2);assert.equal(requests[0].id,requests[1].id);
  assert.equal(requests[0].body.purchase_units[0].amount.value,'12.34');assert.equal(requests[0].body.purchase_units[0].custom_id,oid);
  assert.equal(requests[0].body.payment_source.paypal.experience_context.shipping_preference,'NO_SHIPPING');
  f.checkout.created_at=new Date(Date.now()-4*3600000).toISOString();await assert.rejects(f.service.createPayPalCheckout(oid,'https://shop.example'),/expired/);
  await assert.rejects(f.service.createPayPalCheckout(oid,'http://retail.localhost:3002'),/Secure/);
});
test('capture verifies provider amount, currency, merchant, references and uniqueness before fulfillment',async()=>{
  for(const change of [o=>o.purchase_units[0].amount.value='0.01',o=>o.purchase_units[0].amount.currency_code='GBP',o=>o.purchase_units[0].payee.merchant_id='OTHERMERCHANT',o=>o.purchase_units[0].custom_id='other',o=>o.purchase_units[0].reference_id='other',o=>o.purchase_units.push(o.purchase_units[0]),o=>o.id='DIFFERENTORDER',o=>o.intent='AUTHORIZE']) {
    const f=fixture();change(f.order);await assert.rejects(f.service.confirmPayPalCheckout(oid,paypalId));assert.deepEqual(f.counts(),{captures:0,completed:0});
  }
  const f=fixture();await assert.rejects(f.service.confirmPayPalCheckout(oid,'OTHERORDER'));assert.equal(f.calls.length,0);
});
test('approved orders are not marked paid; verified capture retries never capture twice',async()=>{
  const f=fixture();assert.equal((await f.service.confirmPayPalCheckout(oid,paypalId,false)).status,'PENDING');assert.deepEqual(f.counts(),{captures:0,completed:0});
  assert.equal((await f.service.confirmPayPalCheckout(oid,paypalId)).status,'COMPLETED');assert.equal((await f.service.confirmPayPalCheckout(oid,paypalId)).status,'COMPLETED');
  assert.equal(f.counts().captures,1);assert.equal(f.calls.find(c=>c.path?.endsWith('/capture')).id,'capture-'+f.checkout.request_id);
  for(const change of [c=>c.status='PENDING',c=>c.amount.value='1.00',c=>c.amount.currency_code='INR',c=>c.final_capture=false,c=>delete c.id]) {
    const g=fixture();await g.service.confirmPayPalCheckout(oid,paypalId);change(g.order.purchase_units[0].payments.captures[0]);await assert.rejects(g.service.confirmPayPalCheckout(oid,paypalId));assert.equal(g.counts().completed,1);
  }
  f.order.purchase_units[0].payments.captures.push(f.order.purchase_units[0].payments.captures[0]);await assert.rejects(f.service.confirmPayPalCheckout(oid,paypalId));
});
test('live approval links reject other hosts, Sandbox, HTTP and another order',()=>{
  const f=fixture();for(const url of ['https://evil.invalid','https://www.sandbox.paypal.com/?token='+paypalId,'http://www.paypal.com/?token='+paypalId,'https://www.paypal.com/?token=OTHER','https://user@www.paypal.com/?token='+paypalId]){f.order.links[0].href=url;assert.throws(()=>f.service.paypalApprovalUrl(f.order));}
});
test('webhook verification preserves original JSON and rejects missing, invalid and Sandbox signatures',async()=>{
  let payload,requests=0,status='SUCCESS';
  const service=load('lib/paypal-webhook.ts',{'server-only':{},'node:crypto':crypto,'@/lib/paypal-checkout':{paypalLiveConfiguration:()=>({webhookId:'WEBHOOKFIXTURE'})},'@/lib/paypal':{paypalRequest:async(path,method,body)=>{requests++;payload=body;assert.equal(path,'/v1/notifications/verify-webhook-signature');return {verification_status:status}}}});
  const headers=new Headers({'paypal-transmission-id':'transmission-1','paypal-transmission-time':new Date().toISOString(),'paypal-cert-url':'https://api.paypal.com/v1/notifications/certs/CERT-123','paypal-auth-algo':'SHA256withRSA','paypal-transmission-sig':'signature'});
  const raw='{ "id": "WH-1", "event_type": "PAYMENT.CAPTURE.COMPLETED", "resource": { "amount": {"value":"12.34"} } }';
  assert.equal((await service.verifyPayPalWebhook(raw,headers)).id,'WH-1');assert(payload.endsWith('"webhook_event":'+raw+'}'));
  status='FAILURE';assert.equal(await service.verifyPayPalWebhook(raw,headers),null);
  headers.set('paypal-cert-url','https://api.sandbox.paypal.com/v1/notifications/certs/CERT-123');assert.equal(await service.verifyPayPalWebhook(raw,headers),null);
  assert.equal(await service.verifyPayPalWebhook(raw,new Headers()),null);assert.equal(requests,2);
  assert.equal(await service.readPayPalBody(new Request('https://shop.example',{method:'POST',body:'abc'}),3),'abc');
  await assert.rejects(service.readPayPalBody(new Request('https://shop.example',{method:'POST',body:'abcd'}),3),/large/);
});

test('customer payment route denies foreign origins, bad access and repeated attempts; notification failure cannot reverse payment success',async()=>{
  let allowed=true,limited=false,created=0,confirmed=0;
  const origin=load('lib/paypal-request-origin.ts',{'server-only':{}},{process:{env:{NODE_ENV:'production'}}});
  const route=load('app/api/paypal/checkout/route.ts',{
    '@/lib/paypal-request-origin':origin,'@/lib/paypal-webhook':{readPayPalBody:r=>r.text()},
    '@/lib/request-security':{privateJson:(b,s=200)=>Response.json(b,{status:s}),consumeRate:async()=>!limited},
    '@/lib/paypal-notifications':{finishPayPalOrder:async()=>{throw Error('mail retry')}},
    '@/lib/paypal-checkout':{authorizePayPalOrder:async(id,token)=>{if(!allowed||id!==oid||token!=='access')throw Error();return id;},createPayPalCheckout:async()=>{created++;return {checkoutUrl:'fixture'}},confirmPayPalCheckout:async(id,expected)=>{assert.equal(id,oid);assert.equal(expected,paypalId);confirmed++;return {status:'COMPLETED',orderId:oid}}},
  },{console:{error(){}}});
  const post=(body={},requestOrigin='https://shop.example')=>route.POST(new Request('https://shop.example/api/paypal/checkout',{method:'POST',headers:requestOrigin?{origin:requestOrigin}:{},body:JSON.stringify({orderId:oid,accessToken:'access',action:'create',...body})}));
  assert.equal((await post({},'https://evil.invalid')).status,403);assert.equal((await post({},null)).status,403);
  allowed=false;assert.equal((await post()).status,403);allowed=true;limited=true;assert.equal((await post()).status,429);limited=false;
  assert.equal((await post({action:'refund'})).status,400);assert.equal(created,0);
  assert.equal((await post({amount:'0.01'})).status,200);assert.equal(created,1);
  assert.equal((await post({action:'confirm',paypalOrderId:'bad'})).status,400);
  const response=await post({action:'confirm',paypalOrderId:paypalId});assert.equal(response.status,200);assert.equal((await response.json()).status,'COMPLETED');assert.equal(confirmed,1);
});

test('database atomically binds the payment and delivers once, with restricted permissions and recoverable fulfillment',async()=>{
  const db=new PGlite();
  try {
    await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
      create type payment_method as enum('FREEKASSA','UPI');create type order_status as enum('PENDING_PAYMENT','PAID','DELIVERED','CANCELLED');
      create table orders(id uuid primary key,total numeric(12,2),currency text,status order_status,paid_at timestamptz,delivered_at timestamptz,updated_at timestamptz);
      create table payments(id uuid primary key,order_id uuid references orders,method payment_method,status text,amount numeric(12,2),currency text,gateway_order_id text,gateway_payment_id text,transaction_id text,verified_at timestamptz,updated_at timestamptz);
      create table products(id uuid primary key,allowed_payment_methods text[]);create table order_items(id uuid primary key,order_id uuid,product_id uuid);
      create table deliveries(order_id uuid);create function fulfill_instant_items(uuid) returns boolean language plpgsql as $$ begin insert into deliveries values($1);return false;end $$;
      create function create_store_order(text,text,text,text,jsonb,text) returns jsonb language plpgsql as $$ declare v_method payment_method;begin case lower($4) when 'freekassa' then v_method := 'FREEKASSA'; else raise exception 'invalid';end case;return jsonb_build_object('method',v_method,'safeguard','preserved');end $$;`);
    const migration=fs.readFileSync('supabase/migrations/20261008_030000_paypal_checkout.sql','utf8');
    await db.exec(migration);await db.exec(migration);
    assert.equal((await db.query(`select create_store_order('','','','paypal','[]','') as result`)).rows[0].result.safeguard,'preserved');
    const permissions=await db.query(`select has_function_privilege('anon','public.complete_paypal_checkout(uuid,text,text,text,numeric,text)','EXECUTE') anon,has_function_privilege('authenticated','public.begin_paypal_checkout(uuid,text)','EXECUTE') auth,has_table_privilege('anon','public.paypal_checkouts','SELECT') read,has_function_privilege('service_role','public.complete_paypal_checkout(uuid,text,text,text,numeric,text)','EXECUTE') service`);
    assert.deepEqual(permissions.rows[0],{anon:false,auth:false,read:false,service:true});
    await db.query(`insert into orders values($1,12.34,'USD','PENDING_PAYMENT',null,null,now());`,[oid]);
    await db.query(`insert into payments(id,order_id,method,status,amount,currency) values($1,$2,'PAYPAL','PENDING',12.34,'USD')`,[pid,oid]);
    await db.query(`insert into products values($1,array['UPI'])`,[oid]);
    await db.query(`insert into order_items values($1,$1,$1)`,[oid]);
    await assert.rejects(db.query(`select begin_paypal_checkout($1,'https://shop.example')`,[oid]),/not allowed/);
    await db.query(`update products set allowed_payment_methods=array['PAYPAL'] where id=$1`,[oid]);
    const first=(await db.query(`select begin_paypal_checkout($1,'https://shop.example') result`,[oid])).rows[0].result;
    const second=(await db.query(`select begin_paypal_checkout($1,'https://other.example') result`,[oid])).rows[0].result;
    assert.equal(first.request_id,second.request_id);assert.equal(second.return_origin,'https://shop.example');
    await db.query(`select attach_paypal_checkout($1,$2,$3)`,[oid,paypalId,merchant]);
    await assert.rejects(db.query(`select attach_paypal_checkout($1,'OTHERORDER12345',$2)`,[oid,merchant]),/different/);
    for(const args of [[oid,paypalId,captureId,merchant,'1','USD'],[oid,paypalId,captureId,'OTHER','12.34','USD'],[oid,paypalId,captureId,merchant,'12.34','GBP'],[oid,paypalId,captureId,null,'12.34','USD']])await assert.rejects(db.query(`select complete_paypal_checkout($1,$2,$3,$4,$5,$6)`,args),/verification/);
    assert.equal((await db.query(`select count(*)::int count from deliveries`)).rows[0].count,0);
    // Simulate a stock failure after PayPal captured the funds.
    await db.exec(`create or replace function fulfill_instant_items(uuid) returns boolean language plpgsql as $$begin insert into deliveries values($1);raise exception 'stock unavailable';end $$;`);
    const args=[oid,paypalId,captureId,merchant,'12.34','USD'];
    await db.query(`select complete_paypal_checkout($1,$2,$3,$4,$5,$6)`,args);
    assert.equal((await db.query(`select status from orders where id=$1`,[oid])).rows[0].status,'PAID');
    assert.equal((await db.query(`select count(*)::int count from deliveries`)).rows[0].count,0);
    assert.equal((await db.query(`select delivery_pending from paypal_checkouts where order_id=$1`,[oid])).rows[0].delivery_pending,true);
    await db.exec(`create or replace function fulfill_instant_items(uuid) returns boolean language plpgsql as $$begin insert into deliveries values($1);return false;end $$;`);
    await Promise.all([db.query(`select complete_paypal_checkout($1,$2,$3,$4,$5,$6)`,args),db.query(`select complete_paypal_checkout($1,$2,$3,$4,$5,$6)`,args)]);
    assert.equal((await db.query(`select count(*)::int count from deliveries`)).rows[0].count,1);
    assert.equal((await db.query(`select status from orders where id=$1`,[oid])).rows[0].status,'DELIVERED');
    await assert.rejects(db.query(`select complete_paypal_checkout($1,$2,'DIFFERENTCAPTURE',$3,12.34,'USD')`,[oid,paypalId,merchant]),/does not match/);
  } finally { await db.close(); }
});
