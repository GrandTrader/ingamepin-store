const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
function fn(file,name){const s=fs.readFileSync(file,'utf8'),start=s.search(new RegExp('create (or replace )?function public\\.'+name+'\\(','i'));assert(start>=0,name);return s.slice(start,s.indexOf('$$;',start)+3);}
(async()=>{const db=new PGlite();let checks=0;try{
await db.exec([
"create role anon;create role authenticated;create role service_role bypassrls;",
"create type payment_method as enum('UPI','WALLET','PAYPAL','PALLY','FREEKASSA','USDT_DIRECT','BINANCE_PAY','NOWPAYMENTS');",
"create table products(id uuid primary key,allowed_payment_methods text[]);create table payment_gateway_settings(id boolean primary key,gateway_commissions jsonb);",
"create type order_status as enum('PENDING_PAYMENT','PAYMENT_REVIEW','PAID','PROCESSING','DELIVERED','CANCELLED','REFUNDED');",
"create table orders(id uuid primary key,order_number text default 'IP2026TEST',customer_id uuid,customer_email text,customer_ip inet,total numeric default 10,currency text default 'USD',access_token_hash text,admin_note text,payment_fee numeric default 0,payment_fee_type text,payment_fee_value numeric,status order_status default 'PENDING_PAYMENT',paid_at timestamptz,delivered_at timestamptz,created_at timestamptz default now(),updated_at timestamptz);",
"create table payments(id uuid primary key,order_id uuid references orders,method payment_method default 'PALLY',status text default 'PENDING',amount numeric default 10,currency text default 'USD',gateway_order_id text,gateway_payment_id text,gateway_checkout_url text,transaction_id text,verified_at timestamptz,submitted_at timestamptz,rejection_reason text,screenshot_url text,rejected_at timestamptz,gateway_status_checked_at timestamptz,gateway_last_status text,created_at timestamptz default now(),updated_at timestamptz);",
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
await db.exec("create function submit_manual_payment(uuid,text,text,text,text) returns jsonb language sql as $$select '{}'::jsonb$$;");
const switchMigration=fs.readFileSync('supabase/migrations/20261023_160000_checkout_payment_method_switch.sql','utf8');
await db.exec(switchMigration);await db.exec(switchMigration);
await db.query("insert into products values($1,array['UPI','WALLET','PALLY','PAYPAL','BINANCE_PAY','USDT_DIRECT','FREEKASSA'])",[id(200)]);
await db.exec('insert into payment_gateway_settings values(true,\'{"PALLY":{"enabled":true,"type":"PERCENTAGE","value":4},"PAYPAL":{"enabled":true,"type":"PERCENTAGE","value":5},"WALLET":{"enabled":true,"value":0},"UPI":{"enabled":true,"type":"FIXED","value":0.5}}\')');
await db.query("insert into product_options values($1,'INR')",[id(100)]);
await db.query("insert into product_purchase_restrictions values($1,true,true,'ACCOUNT_EMAIL','ROLLING_1_DAY','INR',10000,'Limit')",[id(200)]);
const reset=async(age=16,method='PALLY')=>{
 await db.exec("delete from checkout_payment_attempts;delete from gift_card_codes;delete from order_items;delete from wallet_transactions;delete from paypal_checkouts;delete from payments;delete from orders;delete from fulfill_calls;delete from customer_wallets");
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

const switchTo=async(method='PAYPAL',variant='paypal',total=10.5,revision=0)=>(await call('select switch_checkout_payment_method($1,$2,$3,$4,$5,$6) value',[id(1),method,variant,'b'.repeat(64),revision,total])).value;
const settle=async(method='PALLY',ref='old-bill',tx='paid')=>(await call('select complete_checkout_attempt($1,$2,$3,$4) value',[id(2),method,ref,tx])).value;
await reset(1);await db.exec("update payments set gateway_order_id='old-bill',gateway_checkout_url='https://gateway.test/old';update orders set total=10.4,payment_fee=0.4");
const original=(await call('select payment_expires_at from orders')).payment_expires_at;
const changed=await switchTo();assert.equal(changed.totalAmount,10.5);assert.equal(changed.paymentMethod,'PAYPAL');
assert.deepEqual((await call('select payment_expires_at from orders')).payment_expires_at,original);
assert.equal((await call('select count(*)::int n from orders')).n,1);
assert.equal((await call('select count(*)::int n from payments')).n,1);
let p=await call('select * from payments');assert.equal(p.gateway_order_id,null);assert.equal(p.gateway_checkout_url,null);assert.equal(p.checkout_revision,1);assert.equal(Number(p.amount),10.5);
assert.equal((await call("select count(*)::int n from checkout_gateway_payments where order_id=$1 and method='PALLY'",[id(1)])).n,1);checks++;
await assert.rejects(switchTo('WALLET','wallet',10,0),/changed/);await assert.rejects(switchTo('WALLET','wallet',0.01,1),/total changed/);
await assert.rejects(switchTo('PALLY','pally',10.4,1),/already replaced/);checks++;
assert.equal((await settle()).requiresReview,true);assert.equal((await settle()).requiresReview,true);assert.equal((await state()).deliveries,0);assert.equal((await state()).order_status,'PAYMENT_REVIEW');
assert.equal((await call('select count(*)::int n from checkout_payment_attempts where received_at is not null')).n,1);
await assert.rejects(settle('PALLY','bad-ref'),/verification/);await assert.rejects(settle('FREEKASSA','old-bill'),/verification/);await assert.rejects(settle('PALLY','old-bill','other'),/different payment/);checks++;
await db.exec("update payments set gateway_order_id='new-bill'");assert.equal((await settle('PAYPAL','new-bill','new-payment')).requiresReview,true);assert.equal((await state()).deliveries,0);checks++;
// If the new method settles first, the old method is still recorded without touching fulfillment or the wallet.
await reset(1);await db.exec("update payments set gateway_order_id='old-bill'");await switchTo('WALLET','wallet',10);
await db.query('select pay_order_with_wallet($1,$2)',[id(1),id(10)]);const paidState=await state();
assert.equal((await settle()).requiresReview,true);assert.equal((await state()).order_status,paidState.order_status);assert.equal((await state()).debits,1);assert.equal((await state()).deliveries,paidState.deliveries);checks++;
// Callback wins the race: changing methods cannot touch a settled payment.
await reset(1);await db.exec("update payments set gateway_order_id='old-bill'");await settle();await assert.rejects(switchTo(),/awaiting payment/);assert.equal((await state()).deliveries,1);checks++;
for(const patch of ["update payments set status='SUBMITTED'","update payments set transaction_id='proof'","update payments set screenshot_url='proof.png'","update payments set submitted_at=now()","update payments set checkout_creation_token=gen_random_uuid()"]){
 await reset(1);await db.exec(patch);await assert.rejects(switchTo(),/status|prepared/);assert.equal((await call('select count(*)::int n from checkout_payment_attempts')).n,0);checks++;
}
await reset(16);await assert.rejects(switchTo(),/expired/);checks++;
await reset(1);await assert.rejects(switchTo('PALLY','paypal',10.4),/Invalid/);await assert.rejects(switchTo('UNKNOWN','unknown',10),/Invalid/);checks++;
await db.query("update products set allowed_payment_methods=array['WALLET'] where id=$1",[id(200)]);await assert.rejects(switchTo(),/not allowed/);
await db.query("update products set allowed_payment_methods=array['UPI','WALLET','PALLY','PAYPAL','BINANCE_PAY','USDT_DIRECT','FREEKASSA'] where id=$1",[id(200)]);checks++;
// Fee replacement never compounds previous method fees.
await reset(1);await db.exec('update orders set total=10.4,payment_fee=0.4');await switchTo('UPI','manual_upi',10.5);
await switchTo('UPI','upi',10.5,1);assert.equal((await call('select checkout_variant from payments')).checkout_variant,'upi');
await switchTo('WALLET','wallet',10,2);assert.equal(Number((await call('select total from orders')).total),10);checks++;
// Same-method retry preserves the saved fee and deadline, and creates no historical duplicate.
await reset(1);const same=await switchTo('PALLY','pally',10);assert.equal(same.totalAmount,10);assert.equal((await call('select count(*)::int n from checkout_payment_attempts')).n,0);checks++;
// PayPal capture reservation stops switching while the provider request is in flight.
await reset(1,'PAYPAL');await db.exec("update payments set gateway_order_id='PAYPALORDER123'");
await db.query("insert into paypal_checkouts(order_id,payment_id,amount,currency,paypal_order_id,merchant_id) values($1,$2,10,'USD','PAYPALORDER123','MERCHANT12345')",[id(1),id(2)]);
assert.equal((await call('select check_paypal_capture($1) ok',[id(1)])).ok,true);await assert.rejects(switchTo('WALLET','wallet',10),/prepared/);checks++;
// PayPal authorization never captures a replaced checkout. Already-captured late funds are held after verification.
await reset(1,'PAYPAL');await db.exec("update payments set gateway_order_id='PAYPALORDER123'");
await db.query("insert into paypal_checkouts(order_id,payment_id,amount,currency,paypal_order_id,merchant_id) values($1,$2,10,'USD','PAYPALORDER123','MERCHANT12345')",[id(1),id(2)]);
await switchTo('WALLET','wallet',10);assert.equal((await call('select check_paypal_capture($1) ok',[id(1)])).ok,false);
const pp=async(amount=10)=>(await call("select complete_paypal_checkout_attempt($1,'PAYPALORDER123','CAPTURE123456','MERCHANT12345',$2,'USD') value",[id(1),amount])).value;
await assert.rejects(pp(1),/verification/);assert.equal((await pp()).requiresReview,true);assert.equal((await pp()).requiresReview,true);assert.equal((await state()).deliveries,0);checks++;
// Crypto confirmations arriving for a replaced invoice block more payments immediately.
await reset(1,'NOWPAYMENTS');await db.exec("update payments set gateway_order_id='old-bill'");await switchTo('WALLET','wallet',10);
assert.equal((await call("select hold_checkout_attempt($1,'NOWPAYMENTS','old-bill','provider-123') value",[id(2)])).value.requiresReview,true);
assert.equal((await settle('NOWPAYMENTS','old-bill','provider-123')).requiresReview,true);await assert.rejects(switchTo('UPI','upi',10.5,1),/awaiting payment/);checks++;
// Old manual-payment tabs cannot submit against the newly selected instructions.
await reset(1,'UPI');await switchTo('WALLET','wallet',10);
await assert.rejects(db.query('select submit_checkout_manual_payment($1,$2,$3)',[id(1),'a'.repeat(64),'proof']),/details changed/);checks++;
for(const role of ['anon','authenticated']){await reset(1);await db.exec('set role '+role);
 await assert.rejects(switchTo(),/permission denied/);await assert.rejects(db.query('select * from checkout_gateway_payments'),/permission denied/);
 await assert.rejects(db.query('select * from checkout_payment_attempts'),/permission denied/);await db.exec('reset role');checks++;
}
assert.equal((await call("select has_function_privilege('service_role','record_superseded_checkout_payment(uuid,text)','execute') ok")).ok,false);
console.log('PASS: '+checks+' payment-method switch database scenarios — fee replacement, unchanged deadline, race ordering, old callbacks, capture holds, permissions.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
