const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
(async()=>{const db=new PGlite();try{
 await db.exec("create role anon;create role authenticated;create role service_role bypassrls;"+
 "create table orders(id uuid primary key,customer_id uuid,customer_email text,customer_ip inet,status text default 'PENDING_PAYMENT',paid_at timestamptz,delivered_at timestamptz,created_at timestamptz default now(),updated_at timestamptz default now());"+
 "create table payments(id uuid primary key,order_id uuid references orders,method text default 'PALLY',status text default 'PENDING',gateway_order_id text default 'bill',transaction_id text,verified_at timestamptz,submitted_at timestamptz,rejection_reason text,created_at timestamptz default now(),updated_at timestamptz default now());"+
 "create table order_items(id uuid primary key,order_id uuid,product_id uuid,product_option_id uuid,custom_value numeric,denomination numeric,quantity int,service_delivered_at timestamptz);"+
 "create table gift_card_codes(id uuid,order_item_id uuid,status text);"+
 "create table product_options(id uuid primary key,denomination_currency text);"+
 "create table product_purchase_restrictions(product_id uuid primary key,is_enabled boolean,one_per_denomination boolean,identity_mode text,reset_mode text,limit_currency text,weekly_limit numeric,notification_message text);"+
 "create table product_purchase_restriction_exemptions(product_id uuid,user_id uuid);");
 await db.exec(fs.readFileSync('supabase/migrations/20261013_190000_denomination_purchase_limits.sql','utf8'));
 const migration=fs.readFileSync('supabase/migrations/20261021_190000_failed_gateway_payments.sql','utf8');
 await db.exec(migration);await db.exec(migration);
 await db.query("insert into product_options values($1,'INR')",[id(100)]);
 await db.query("insert into product_purchase_restrictions values($1,true,true,'ACCOUNT_EMAIL','ROLLING_1_DAY','INR',10000,'Limit')",[id(200)]);
 const reset=async()=>{await db.exec("delete from gift_card_codes;delete from order_items;delete from payments;delete from orders");
 await db.query("insert into orders(id,customer_email) values($1,'buyer@example.com')",[id(1)]);
 await db.query("insert into payments(id,order_id) values($1,$2)",[id(2),id(1)]);
 await db.query("insert into order_items(id,order_id,product_id,product_option_id,denomination,quantity) values($1,$2,$3,$4,1000,1)",[id(3),id(1),id(200),id(100)]);};
 const fail=async(method='PALLY',ref='bill',state='FAIL')=>(await db.query("select fail_unpaid_gateway_payment($1,$2,$3,$4) result",[id(2),method,ref,state])).rows[0].result;
 const next=async()=>db.exec("begin;insert into orders(id,customer_email) values('"+id(4)+"','buyer@example.com');insert into order_items(id,order_id,product_id,product_option_id,denomination,quantity) values('"+id(5)+"','"+id(4)+"','"+id(200)+"','"+id(100)+"',1000,1);commit;");
 await reset();await assert.rejects(next(),/Only one/);await db.exec('rollback');
 assert.equal((await fail()).released,true);
 const state=(await db.query("select p.status payment,o.status order_status,p.rejection_reason from payments p join orders o on o.id=p.order_id")).rows[0];
 assert.equal(state.payment,'FAILED');assert.equal(state.order_status,'CANCELLED');assert.match(state.rejection_reason,/PALLY.*FAIL/);
 assert.equal((await fail()).alreadyReleased,true);await next();
 for(const change of [
 "update payments set status='VERIFIED'","update payments set status='SUBMITTED'","update payments set verified_at=now()",
 "update payments set submitted_at=now()","update payments set transaction_id='money-received'",
 "update orders set status='PAID',paid_at=now()","update orders set status='PROCESSING'","update orders set status='DELIVERED'",
 "update orders set status='PAYMENT_REVIEW'","update orders set paid_at=now()","update orders set delivered_at=now()",
 "update order_items set service_delivered_at=now()",
 "insert into gift_card_codes values('"+id(6)+"','"+id(3)+"','SOLD')",
 "insert into payments(id,order_id,status) values('"+id(7)+"','"+id(1)+"','VERIFIED')",
 "insert into payments(id,order_id,status) values('"+id(7)+"','"+id(1)+"','PENDING')",
 ]){await reset();await db.exec(change);assert.equal((await fail()).released,false,change);}
 await reset();await assert.rejects(fail('PALLY','other'),/reference/);await assert.rejects(fail('PALLY','bill','NEW'),/Unconfirmed/);await assert.rejects(fail(null,'bill','FAIL'),/Unconfirmed/);await assert.rejects(fail('PALLY','bill',null),/Unconfirmed/);
 for(const[method,state]of [['FREEKASSA','9'],['FREEKASSA','8'],['BINANCE_PAY','EXPIRED'],['NOWPAYMENTS','expired'],['PAYPAL','VOIDED']]){
  await reset();await db.query("update payments set method=$1",[method]);assert.equal((await fail(method,'bill',state)).released,true);
 }
 await reset();await db.exec('set role anon');await assert.rejects(fail(),/permission denied/);await db.exec('reset role');
 await db.exec('set role authenticated');await assert.rejects(fail(),/permission denied/);await db.exec('reset role');
 console.log('PASS: atomic failure, duplicate notifications, quota recovery, paid/partial/delivery guards, provider binding, and restricted permissions');
 }finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
