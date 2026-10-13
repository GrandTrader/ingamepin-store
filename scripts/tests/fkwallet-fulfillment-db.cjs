const fs=require('node:fs'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create type order_status as enum('PENDING_PAYMENT','PAYMENT_REVIEW','PAID','PROCESSING','DELIVERED','CANCELLED','REFUNDED');
 create table products(id uuid primary key,name text,seller_id uuid,stock_quantity int default 0,delivery_type text default 'MANUAL',allows_custom_value boolean default false,allows_player_id_topup boolean default false,updated_at timestamptz);
 create table product_options(id uuid primary key,product_id uuid references products(id),is_active boolean default true,is_custom_value boolean default false,denomination numeric default 1,denomination_currency text default 'USD',stock_quantity int default 0,is_in_stock boolean default false,updated_at timestamptz);
 create table orders(id uuid primary key,status order_status default 'PENDING_PAYMENT',paid_at timestamptz,currency text default 'USD',subtotal numeric default 20,discount numeric default 0,total numeric default 20,delivered_at timestamptz,updated_at timestamptz);
 create table order_items(id uuid primary key,order_id uuid references orders(id),product_id uuid,product_option_id uuid,quantity int,custom_value numeric,fulfillment_mode text default 'CODE',service_delivered_at timestamptz,denomination numeric default 1,unit_price numeric default 20,total_price numeric default 20,customer_information jsonb default '[]');
 create table gift_card_codes(id uuid primary key default gen_random_uuid(),product_id uuid,product_option_id uuid,order_item_id uuid,denomination numeric,code text unique,status text,note text,reserved_at timestamptz,sold_at timestamptz);
 create table payments(order_id uuid,status text,currency text,amount numeric);
 create table order_item_refunds(order_id uuid,order_item_id uuid,status text,quantity int);
 create table order_refund_requests(order_id uuid,status text);
 create table fkwallet_imports(product_id uuid primary key references products,connection_id text,supplier_category_id bigint,exchange_rate numeric,customer_fields jsonb default '[]');
 create table fkwallet_product_links(option_id uuid primary key,product_id uuid references fkwallet_imports,connection_id text,supplier_product_id bigint,supplier_cost numeric,supplier_currency text);
 create table product_customer_fields(id uuid primary key,product_id uuid,field_type text,is_required boolean);`);
 for(const file of ['20260918_234000_sync_code_inventory.sql','20260925_150000_definiteplay_fulfillment.sql','20260925_160000_fix_definiteplay_order_status_guard.sql','20261006_120000_giftport_fulfillment.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await db.exec('create trigger stock_guard before insert on order_items for each row execute function guard_order_item_combined_stock()');
 await db.exec(fs.readFileSync('supabase/migrations/20261013_170000_fkwallet_fulfillment.sql','utf8'));
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),connection='a'.repeat(64);
 const q=(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>(await q(sql,args)).rows[0],reject=async(sql,args=[])=>assert.rejects(q(sql,args));
 async function product(n,kind){
  await q('insert into products(id,name) values($1,$2)',[id(n),'Test '+kind]);
  await q('insert into product_options(id,product_id) values($1,$2)',[id(n+1),id(n)]);
  const fields=kind==='ACCOUNT'?[{key:'Input1',fieldId:id(n+2),fieldType:'TEXT'}]:[];
  await q('insert into fkwallet_imports values($1,$2,2,88,$3)',[id(n),connection,JSON.stringify(fields)]);
  if(fields.length)await q("insert into product_customer_fields values($1,$2,'TEXT',true)",[id(n+2),id(n)]);
  await q("insert into fkwallet_product_links values($1,$2,$3,9,880,'RUB')",[id(n+1),id(n),connection]);
 }
 await product(1,'ACCOUNT');
 await reject("select configure_fkwallet_product($1,true,'ACCOUNT',$2)",[id(1),connection]);
 assert.equal((await one('select stock_source from products where id=$1',[id(1)])).stock_source,'OWNED');
 await q('insert into fkwallet_worker_state(connection_id) values($1)',[connection]);
 async function enable(n,kind){await q('select configure_fkwallet_product($1,true,$2,$3)',[id(n),kind,connection]);await q('select sync_fkwallet_stock($1,$2,$3)',[id(n),connection,JSON.stringify([{optionId:id(n+1),quantity:10}])]);}
 await enable(1,'ACCOUNT');
 await reject("update fkwallet_product_links set supplier_product_id=999 where option_id=$1",[id(2)]);
 await reject("delete from product_customer_fields where id=$1",[id(3)]);
 await reject("insert into gift_card_codes(product_id,code,status) values($1,'BAD','AVAILABLE')",[id(1)]);
 await q('select reconcile_code_inventory($1)',[id(1)]);assert.equal((await one('select stock_quantity from products where id=$1',[id(1)])).stock_quantity,10);
 async function order(n,p,qty=1){await q('insert into orders(id) values($1)',[id(n)]);await q('insert into order_items(id,order_id,product_id,product_option_id,quantity,customer_information) values($1,$2,$3,$4,$5,$6)',[id(n+1),id(n),id(p),id(p+1),qty,JSON.stringify([{fieldId:id(p+2),value:'@recipient'}])]);}
 async function pay(n){await q("update orders set status='PAID',paid_at=now() where id=$1",[id(n)]);await q("insert into payments values($1,'VERIFIED','USD',20)",[id(n)]);await q('update definiteplay_jobs set next_check=now() where order_id=$1',[id(n)]);}
 const claim=async()=>(await one("select claim_supplier_job('FKWALLET') job")).job;
 await order(10,1);
 assert.equal(await claim(),null);
 await q("update orders set status='PAID',paid_at=now() where id=$1",[id(10)]);assert.equal(await claim(),null,'unverified payments cannot spend');
 await pay(10);assert.equal((await one('select claim_definiteplay_job() job')).job,null,'old supplier worker cannot claim FKWallet');
 const job=await claim();assert.equal(job.provider,'FKWALLET');assert.equal(await claim(),null,'concurrent claims are exclusive');
 await reject('update order_items set service_delivered_at=now() where id=$1',[id(11)]);
 await reject('update order_items set quantity=2 where id=$1',[id(11)]);
 await reject('select complete_fkwallet_job($1,$2,ARRAY[]::text[])',[id(11),job.lease_token]);
 await q('select mark_fkwallet_unit_submitted($1,$2,1,$3)',[id(11),job.lease_token,'encrypted-request-fixture']);
 await reject('select mark_fkwallet_unit_submitted($1,$2,1,$3)',[id(11),job.lease_token,'encrypted-request-fixture']);
 await reject("update orders set status='CANCELLED' where id=$1",[id(10)]);
 await reject("insert into order_item_refunds values($1,$2,'CREDITED',1)",[id(10),id(11)]);
 await reject("select configure_fkwallet_product($1,false,'ACCOUNT',$2)",[id(1),connection]);
 await reject("select record_fkwallet_unit($1,$2,1,'123','success',881,'encrypted-result-fixture')",[id(11),job.lease_token]);
 await q("select record_fkwallet_unit($1,$2,1,'123','in_process',null,'encrypted-result-fixture')",[id(11),job.lease_token]);
 await reject('select complete_fkwallet_job($1,$2,ARRAY[]::text[])',[id(11),job.lease_token]);
 await reject("select record_fkwallet_unit($1,$2,1,'124','success',880,'encrypted-result-fixture')",[id(11),job.lease_token]);
 await q("select record_fkwallet_unit($1,$2,1,'123','success',880,'encrypted-result-fixture')",[id(11),job.lease_token]);
 await q('select complete_fkwallet_job($1,$2,ARRAY[]::text[])',[id(11),job.lease_token]);
 await q('select complete_fkwallet_job($1,$2,ARRAY[]::text[])',[id(11),job.lease_token]);
 assert.equal((await one('select status from orders where id=$1',[id(10)])).status,'DELIVERED');
 assert.ok((await one('select service_delivered_at from order_items where id=$1',[id(11)])).service_delivered_at);
 assert.equal((await one('select count(*)::int n from gift_card_codes')).n,0,'account activation does not invent a code');
 // Code delivery waits for every separately journaled unit.
 await product(20,'CODE');await enable(20,'CODE');await order(30,20,2);await pay(30);const codes=await claim();
 await reject('select mark_fkwallet_unit_submitted($1,$2,2,$3)',[id(31),codes.lease_token,'encrypted-request-fixture']);
 for(let n=1;n<=2;n++){
  await q('select mark_fkwallet_unit_submitted($1,$2,$3,$4)',[id(31),codes.lease_token,n,'encrypted-request-fixture']);
  await q("select record_fkwallet_unit($1,$2,$3,$4,'success',880,'encrypted-result-fixture')",[id(31),codes.lease_token,n,String(200+n)]);
  if(n===1)await reject("select complete_fkwallet_job($1,$2,ARRAY['CODE-1'])",[id(31),codes.lease_token]);
 }
 await reject("select complete_fkwallet_job($1,$2,ARRAY['SAME','SAME'])",[id(31),codes.lease_token]);
 await q("select complete_fkwallet_job($1,$2,ARRAY['CODE-1','CODE-2'])",[id(31),codes.lease_token]);
 assert.equal((await one('select count(*)::int n from gift_card_codes')).n,2);
 assert.equal((await one('select status from orders where id=$1',[id(30)])).status,'DELIVERED');
 // Customer refund holds and discounted revenue are checked again at submission.
 await order(40,20);await pay(40);const held=await claim();await q("insert into order_refund_requests values($1,'REQUESTED')",[id(40)]);
 await reject('select mark_fkwallet_unit_submitted($1,$2,1,$3)',[id(41),held.lease_token,'encrypted-request-fixture']);
 await order(50,20);await pay(50);await q('update orders set discount=15 where id=$1',[id(50)]);assert.equal(await claim(),null);assert.equal((await one('select state from definiteplay_jobs where item_id=$1',[id(51)])).state,'REVIEW');
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await reject('select * from fkwallet_units');await reject("select configure_fkwallet_product($1,true,'CODE',$2)",[id(20),connection]);await reject('select complete_fkwallet_job($1,$2,ARRAY[]::text[])',[id(11),job.lease_token]);await db.exec('reset role');}
 await db.close();console.log('PASS: FKWallet paid-only delivery, provider isolation, recipient snapshots, unit submission markers, refund locks, account/code completion and permissions');
})().catch(error=>{console.error(error);process.exitCode=1});
