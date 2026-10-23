const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function fn(file,name){const s=fs.readFileSync(file,'utf8'),start=s.search(new RegExp('create (or replace )?function public\\.'+name+'\\(','i'));assert(start>=0,name);return s.slice(start,s.indexOf('$$;',start)+3);}
(async()=>{const db=new PGlite();let checks=0;try{
await db.exec([
"create role anon;create role authenticated;create role service_role bypassrls;",
"create type order_status as enum('PENDING_PAYMENT','PAYMENT_REVIEW','PAID','PROCESSING','DELIVERED','CANCELLED','REFUNDED');",
"create table orders(id uuid primary key,order_number text default 'IP2026TEST',customer_id uuid,customer_email text,customer_ip inet,total numeric default 10,currency text default 'USD',access_token_hash text,status order_status default 'PENDING_PAYMENT',paid_at timestamptz,delivered_at timestamptz,created_at timestamptz default now(),updated_at timestamptz);",
"create table payments(id uuid primary key,order_id uuid references orders,method text default 'PALLY',status text default 'PENDING',amount numeric default 10,currency text default 'USD',gateway_order_id text,gateway_payment_id text,gateway_checkout_url text,transaction_id text,verified_at timestamptz,submitted_at timestamptz,rejection_reason text,created_at timestamptz default now(),updated_at timestamptz);",
"create table order_items(id uuid primary key,order_id uuid,product_id uuid,product_option_id uuid,custom_value numeric,denomination numeric,quantity int,service_delivered_at timestamptz);",
"create table gift_card_codes(id uuid,order_item_id uuid,status text);",
"create table customer_wallets(user_id uuid primary key,balance numeric(12,2) default 100,updated_at timestamptz);",
"create table wallet_transactions(user_id uuid,transaction_type text,amount numeric,balance_before numeric,balance_after numeric,description text,order_id uuid,reference_id text);",
"create table product_options(id uuid primary key,denomination_currency text);",
"create table product_purchase_restrictions(product_id uuid primary key,is_enabled boolean,one_per_denomination boolean,identity_mode text,reset_mode text,limit_currency text,weekly_limit numeric,notification_message text);",
"create table product_purchase_restriction_exemptions(product_id uuid,user_id uuid);",
"create table paypal_checkouts(order_id uuid primary key,payment_id uuid,amount numeric,currency text,return_origin text,paypal_order_id text,merchant_id text,capture_id text,delivery_pending boolean default false,completed_at timestamptz);",
"create table fulfill_calls(order_id uuid);",
"create function fulfill_instant_items(p_order_id uuid) returns boolean language plpgsql as $$begin insert into fulfill_calls values(p_order_id);return true;end$$;"
].join('\n'));
await db.exec(fn('supabase/migrations/00000005_binance_pay_functions.sql','complete_binance_payment'));
await db.exec(fn('supabase/migrations/00000004_wallet_functions.sql','pay_order_with_wallet'));
for(const name of ['check_paypal_capture','complete_paypal_checkout'])await db.exec(fn('supabase/migrations/20261008_030000_paypal_checkout.sql',name));
await db.exec(fs.readFileSync('supabase/migrations/20261013_190000_denomination_purchase_limits.sql','utf8'));
const migration=fs.readFileSync('supabase/migrations/20261023_120000_checkout_retry_expiry.sql','utf8');
await db.exec(migration);await db.exec(migration);
await db.query("insert into product_options values($1,'INR')",[id(100)]);
await db.query("insert into product_purchase_restrictions values($1,true,true,'ACCOUNT_EMAIL','ROLLING_1_DAY','INR',10000,'Limit')",[id(200)]);
const reset=async(age=16,method='PALLY')=>{
 await db.exec("delete from gift_card_codes;delete from order_items;delete from wallet_transactions;delete from paypal_checkouts;delete from payments;delete from orders;delete from fulfill_calls;delete from customer_wallets");
 await db.query("insert into customer_wallets(user_id) values($1)",[id(10)]);
 await db.query("insert into orders(id,customer_id,customer_email,created_at,payment_expires_at) values($1,$2,'buyer@example.com',now()-($3::int*interval '1 minute'),now()+((15-$3::int)*interval '1 minute'))",[id(1),id(10),age]);
 await db.query("insert into payments(id,order_id,method) values($1,$2,$3)",[id(2),id(1),method]);
 await db.query("insert into order_items(id,order_id,product_id,product_option_id,denomination,quantity) values($1,$2,$3,$4,1000,1)",[id(3),id(1),id(200),id(100)]);
};
const call=async(sql,args=[])=>(await db.query(sql,args)).rows[0];
const expire=async()=>(await call('select expire_unpaid_checkout($1) ok',[id(1)])).ok;
const retry=async()=>(await call('select prepare_order_payment_retry($1,$2) value',[id(1),'a'.repeat(64)])).value;
const complete=async(ref='bill',tx='paid')=>(await call('select complete_binance_payment($1,$2,$3) value',[id(2),ref,tx])).value;
const state=()=>call("select o.status order_status,p.status payment,p.transaction_id,(select count(*)::int from fulfill_calls) deliveries,(select count(*)::int from wallet_transactions) debits from orders o join payments p on p.order_id=o.id where o.id=$1",[id(1)]);
await reset(14);assert.equal(await expire(),false);const retryBefore=await retry();assert.equal(retryBefore.totalAmount,10);
await db.exec("update orders set payment_expires_at=now()");assert.equal(await expire(),true);assert.equal(await expire(),false);
assert.equal((await state()).payment,'FAILED');assert.equal((await state()).order_status,'CANCELLED');await assert.rejects(retry(),/awaiting payment/);checks++;
const next=()=>db.exec("begin;insert into orders(id,customer_email) values('"+id(4)+"','buyer@example.com');insert into order_items(id,order_id,product_id,product_option_id,denomination,quantity) values('"+id(5)+"','"+id(4)+"','"+id(200)+"','"+id(100)+"',1000,1);commit;");
await reset();await assert.rejects(next(),/Only one/);await db.exec('rollback');assert.equal(await expire(),true);await next();checks++;
for(const patch of [
"update payments set status='VERIFIED'","update payments set status='SUBMITTED'","update payments set verified_at=now()",
"update payments set submitted_at=now()","update payments set transaction_id='proof'",
"update orders set status='PAID',paid_at=now()","update orders set status='PROCESSING'","update orders set status='PAYMENT_REVIEW'",
"update orders set delivered_at=now()","update order_items set service_delivered_at=now()",
"insert into wallet_transactions(order_id) values('"+id(1)+"')",
"insert into gift_card_codes values('"+id(6)+"','"+id(3)+"','SOLD')",
"insert into gift_card_codes values('"+id(6)+"','"+id(3)+"','RESERVED')",
"update payments set checkout_creation_token=gen_random_uuid(),checkout_creation_started_at=now()",
]){await reset();await db.exec(patch);assert.equal(await expire(),false,patch);checks++;}
await reset();await db.exec("update payments set status='SUBMITTED'");
await db.query("insert into orders(id,created_at,payment_expires_at) values($1,now()-interval '16 minutes',now()-interval '1 minute')",[id(4)]);
assert.equal((await call('select expire_unpaid_checkout_orders(1,null) count')).count,1);checks++;
await reset(1);const original=(await call('select payment_expires_at from orders')).payment_expires_at;
await retry();await retry();assert.deepEqual((await call('select payment_expires_at from orders')).payment_expires_at,original);
assert.equal((await call('select count(*)::int n from orders')).n,1);checks++;
await reset(1);const begin=async()=>(await call("select begin_checkout_session($1,'PALLY') value",[id(1)])).value;
assert((await begin()).checkout_creation_token);await assert.rejects(begin(),/being prepared/);
await db.exec("update payments set gateway_order_id='bill',gateway_checkout_url='https://gateway.test/pay'");
assert.equal((await begin()).gateway_checkout_url,'https://gateway.test/pay');checks++;
for(const method of ['PALLY','FREEKASSA','BINANCE_PAY','NOWPAYMENTS','USDT_DIRECT']){
 await reset(16,method);await db.exec("update payments set gateway_order_id='bill'");await expire();
 await assert.rejects(complete('wrong'),/verification/);
 assert.equal((await complete()).requiresReview,true);assert.equal((await complete()).requiresReview,true);
 assert.equal((await state()).deliveries,0);assert.equal((await state()).payment,'SUBMITTED');
 assert.equal((await state()).order_status,'PAYMENT_REVIEW');await assert.rejects(complete('bill','other'),/different payment/);checks++;
}
await reset(14);await db.exec("update payments set gateway_order_id='bill'");await complete();await complete();
assert.equal((await state()).deliveries,1);assert.equal(await expire(),false);checks++;
await reset(16);await db.exec("update payments set gateway_order_id='bill',status='SUBMITTED',submitted_at=now()-interval '2 minutes'");
assert.equal((await complete()).orderStatus,'PAID');checks++;
await reset(16);await db.exec("update payments set gateway_order_id='bill'");assert.equal((await complete()).requiresReview,true);assert.equal((await state()).deliveries,0);checks++;
await reset(1,'WALLET');await db.query('select pay_order_with_wallet($1,$2)',[id(1),id(10)]);
await assert.rejects(db.query('select pay_order_with_wallet($1,$2)',[id(1),id(10)]),/paid again/);assert.equal((await state()).debits,1);assert.equal((await call('select balance from customer_wallets')).balance,'90.00');checks++;
await reset(1,'PALLY');await assert.rejects(db.query('select pay_order_with_wallet($1,$2)',[id(1),id(10)]),/another wallet payment/);assert.equal((await state()).debits,0);checks++;
await reset(16,'WALLET');await assert.rejects(db.query('select pay_order_with_wallet($1,$2)',[id(1),id(10)]),/expired/);assert.equal((await state()).debits,0);checks++;
const pp=async()=>{await db.exec("update payments set gateway_order_id='PAYPALORDER123'");await db.query("insert into paypal_checkouts(order_id,payment_id,amount,currency,paypal_order_id,merchant_id) values($1,$2,10,'USD','PAYPALORDER123','MERCHANT12345')",[id(1),id(2)]);};
const capture=async(amount=10)=>(await call("select complete_paypal_checkout($1,'PAYPALORDER123','CAPTURE123456','MERCHANT12345',$2,'USD') value",[id(1),amount])).value;
await reset(16,'PAYPAL');await pp();assert.equal((await call('select check_paypal_capture($1) ok',[id(1)])).ok,false);
await expire();await assert.rejects(capture(1),/verification/);assert.equal((await capture()).requiresReview,true);assert.equal((await capture()).requiresReview,true);assert.equal((await state()).deliveries,0);checks++;
await reset(1,'PAYPAL');await pp();assert.equal((await call('select check_paypal_capture($1) ok',[id(1)])).ok,true);await capture();await capture();assert.equal((await state()).deliveries,1);checks++;
for(const role of ['anon','authenticated']){await reset();await db.exec('set role '+role);await assert.rejects(expire(),/permission denied/);await assert.rejects(retry(),/permission denied/);await db.exec('reset role');checks++;}
assert.equal((await call("select has_function_privilege('service_role','hold_expired_checkout_payment(uuid,text)','execute') ok")).ok,false);
console.log('PASS: '+checks+' database scenarios — expiry boundary, actual quota release, protected payments, session claims, wallet/PayPal settlement, late callbacks, idempotency and permissions.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
