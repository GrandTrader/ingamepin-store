// Runs real PostgreSQL (PGlite) against an isolated minimal schema; no live DB.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {PGlite}=require("@electric-sql/pglite");
(async()=>{
 const db=new PGlite();
 await db.exec(
  "create role anon; create role authenticated; create role service_role;"+
  "create type order_status as enum ('PENDING_PAYMENT','PAYMENT_REVIEW','PAID','PROCESSING','DELIVERED','CANCELLED','REFUNDED');"+
  "create table products(id uuid primary key,name text,seller_id uuid,stock_quantity int default 0,delivery_type text default 'MANUAL',allows_custom_value boolean default false,allows_player_id_topup boolean default false,updated_at timestamptz);"+
  "create table product_options(id uuid primary key,product_id uuid references products(id),is_active boolean default true,stock_quantity int default 0,is_in_stock boolean default false,updated_at timestamptz);"+
  "create table orders(id uuid primary key,status order_status default 'PENDING_PAYMENT',paid_at timestamptz,currency text default 'USD',subtotal numeric default 20,discount numeric default 0,total numeric default 20,delivered_at timestamptz,updated_at timestamptz);"+
  "create table order_items(id uuid primary key,order_id uuid references orders(id),product_id uuid,product_option_id uuid,quantity int,custom_value numeric,fulfillment_mode text default 'CODE',service_delivered_at timestamptz,denomination numeric,unit_price numeric default 20,total_price numeric default 20);"+
  "create table gift_card_codes(id uuid primary key default gen_random_uuid(),product_id uuid,product_option_id uuid,order_item_id uuid,denomination numeric,code text unique,status text,note text,reserved_at timestamptz,sold_at timestamptz);"+
  "create table payments(order_id uuid,status text,currency text,amount numeric);"+
  "create table order_item_refunds(order_id uuid,order_item_id uuid,status text,quantity int);"
 );
 await db.exec(fs.readFileSync("supabase/migrations/20260918_234000_sync_code_inventory.sql","utf8"));
 await db.exec(fs.readFileSync("supabase/migrations/20260925_150000_definiteplay_fulfillment.sql","utf8"));
 await db.exec("create trigger stock_guard before insert on order_items for each row execute function guard_order_item_combined_stock()");
 const id=n=>"00000000-0000-4000-8000-"+String(n).padStart(12,"0");
 const query=(sql,p=[])=>db.query(sql,p);
 const one=async(sql,p=[]) => (await query(sql,p)).rows[0];
 const reject=async(sql,p=[])=>{await assert.rejects(query(sql,p));};
 await query("insert into products(id,name) values($1,'Test')",[id(1)]);
 await query("insert into product_options(id,product_id) values($1,$2)",[id(2),id(1)]);

 await db.exec("alter table product_options add column denomination numeric default 500; alter table product_options add column denomination_currency text default 'INR'");
 await db.exec(fs.readFileSync("supabase/migrations/20260925_160000_fix_definiteplay_order_status_guard.sql","utf8"));
 // Simulate the installed range exception and assert the new patch preserves it.
 await db.exec("create table product_range_settings(option_id uuid, product_id uuid, enabled boolean, delivery_mode text)");
 const src=(await one("select pg_get_functiondef('guard_order_item_combined_stock()'::regprocedure) as src")).src;
 await db.exec(src.replace("begin", "begin\n if NEW.fulfillment_mode='RANGE_MANUAL' and exists(select 1 from product_range_settings where option_id=NEW.product_option_id and product_id=NEW.product_id and enabled and delivery_mode='MANUAL') then return NEW; end if;"));
 await db.exec(fs.readFileSync("supabase/migrations/20261006_120000_giftport_fulfillment.sql","utf8"));
 assert.match((await one("select pg_get_functiondef('guard_order_item_combined_stock()'::regprocedure) as src")).src,/RANGE_MANUAL/);
 const mapping=JSON.stringify([{optionId:id(2),operatorCode:'AMZN',amount:'500',unitCost:6,limit:10}]);
 await reject("select configure_giftport_product($1,true,$2)",[id(1),mapping]);
 await query("insert into giftport_settings(recipient_name,recipient_email,mobile) values('Business','orders@example.test','9876543210')");
 await query("select configure_giftport_product($1,true,$2)",[id(1),mapping]);
 assert.equal((await one("select stock_source from products")).stock_source,'GIFTPORT');
 await reject("update product_options set denomination=1000 where id=$1",[id(2)]);
 await reject("insert into gift_card_codes(product_id,code,status) values($1,'bad','AVAILABLE')",[id(1)]);
 await query("select sync_giftport_stock($1)",[JSON.stringify([{optionId:id(2),quantity:100}])]);
 assert.equal((await one("select stock_quantity from product_options")).stock_quantity,10);
 await query("select reconcile_code_inventory($1)",[id(1)]);
 assert.equal((await one("select stock_quantity from products")).stock_quantity,10);
 await query("insert into orders(id) values($1)",[id(3)]);
 await query("insert into order_items(id,order_id,product_id,product_option_id,quantity,denomination) values($1,$2,$3,$4,2,500)",[id(4),id(3),id(1),id(2)]);
 assert.equal((await one("select count(*)::int n from giftport_cards")).n,2);
 assert.equal((await one("select count(distinct supplier_reference)::int n from giftport_cards")).n,2);
 await query("update giftport_settings set mobile='9999999999'");
 assert.equal((await one("select supplier_payload->>'mobile' mobile from definiteplay_jobs")).mobile,'9876543210','recipient is snapshotted');
 assert.equal((await one("select claim_supplier_job('GIFTPORT') job")).job,null);
 await query("update orders set status='PAID',paid_at=now() where id=$1",[id(3)]);
 assert.equal((await one("select claim_supplier_job('GIFTPORT') job")).job,null,'unverified payment blocked');
 await query("insert into payments values($1,'VERIFIED','USD',20)",[id(3)]);
 await query("update definiteplay_jobs set next_check=now()");
 assert.equal((await one("select claim_definiteplay_job() job")).job,null,'DP worker cannot claim GP');
 const job=(await one("select claim_supplier_job('GIFTPORT') job")).job;
 assert.equal(job.provider,'GIFTPORT');
 assert.equal((await one("select claim_supplier_job('GIFTPORT') job")).job,null,'concurrent claim blocked');
 await reject("select mark_giftport_card_submitted($1,$2,1)",[id(4),job.lease_token]);
 await query("select mark_definiteplay_submitted($1,$2)",[id(4),job.lease_token]);
 await reject("select mark_giftport_card_submitted($1,$2,2)",[id(4),job.lease_token]);
 await query("select mark_giftport_card_submitted($1,$2,1)",[id(4),job.lease_token]);
 await reject("select mark_giftport_card_submitted($1,$2,1)",[id(4),job.lease_token]);
 await reject("update orders set status='CANCELLED' where id=$1",[id(3)]);
 await reject("insert into order_item_refunds values($1,$2,'CREDITED',1)",[id(3),id(4)]);
 await reject("select configure_giftport_product($1,false,'[]')",[id(1)]);
 await reject("select configure_definiteplay_product($1,false,'[]')",[id(1)]);
 await reject("update products set stock_source='OWNED' where id=$1",[id(1)]);
 await reject("select record_giftport_card($1,null,1,'T1','C1')",[id(4)]);
 await query("select record_giftport_card($1,$2,1,'T1','C1')",[id(4),job.lease_token]);
 await reject("select complete_giftport_job($1,$2)",[id(4),job.lease_token]);
 await query("select mark_giftport_card_submitted($1,$2,2)",[id(4),job.lease_token]);
 await reject("select record_giftport_card($1,$2,2,'T1','C2')",[id(4),job.lease_token]);
 await reject("select record_giftport_card($1,$2,2,'T2','C1')",[id(4),job.lease_token]);
 await query("select record_giftport_card($1,$2,2,'T2','C2')",[id(4),job.lease_token]);
 await query("select complete_giftport_job($1,$2)",[id(4),job.lease_token]);
 await query("select complete_giftport_job($1,$2)",[id(4),job.lease_token]);
 assert.equal((await one("select count(*)::int n from gift_card_codes")).n,2);
 assert.equal((await one("select status from orders")).status,'DELIVERED');
 assert.equal((await one("select cost_is_estimate from definiteplay_jobs")).cost_is_estimate,true);
 // Existing Definite Play products retain their separate worker and delivery path.
 await query("insert into products(id,name) values($1,'DP regression')",[id(10)]);
 await query("insert into product_options(id,product_id) values($1,$2)",[id(11),id(10)]);
 await query("select configure_definiteplay_product($1,true,$2)",[id(10),JSON.stringify([{optionId:id(11),sku:'DP500'}])]);
 await query("select sync_definiteplay_stock($1,now())",[JSON.stringify([{sku:'DP500',cost:'5',quantity:10,currency:'USD'}])]);
 await query("insert into orders(id,status,paid_at) values($1,'PAID',now())",[id(12)]);
 await query("insert into payments values($1,'VERIFIED','USD',20)",[id(12)]);
 await query("insert into order_items(id,order_id,product_id,product_option_id,quantity,denomination) values($1,$2,$3,$4,1,500)",[id(13),id(12),id(10),id(11)]);
 assert.equal((await one("select claim_supplier_job('GIFTPORT') job")).job,null);
 const dp=(await one("select claim_definiteplay_job() job")).job;
 assert.equal(dp.provider,'DEFINITEPLAY');
 await query("select mark_definiteplay_submitted($1,$2)",[id(13),dp.lease_token]);
 await query("select complete_definiteplay_job($1,$2,$3,5)",[id(13),dp.lease_token,['DP-CODE']]);
 assert.equal((await one("select status from orders where id=$1",[id(12)])).status,'DELIVERED');
 assert.equal((await one("select cost_is_estimate from definiteplay_jobs where item_id=$1",[id(13)])).cost_is_estimate,false);
 // GiftPort budgets above discounted revenue are held before any submission.
 await query("insert into orders(id,status,paid_at,discount) values($1,'PAID',now(),15)",[id(20)]);
 await query("insert into payments values($1,'VERIFIED','USD',20)",[id(20)]);
 await query("insert into order_items(id,order_id,product_id,product_option_id,quantity,denomination) values($1,$2,$3,$4,1,500)",[id(21),id(20),id(1),id(2)]);
 assert.equal((await one("select claim_supplier_job('GIFTPORT') job")).job,null);
 assert.equal((await one("select state from definiteplay_jobs where item_id=$1",[id(21)])).state,'REVIEW');
 // Manual range option still bypasses supplier purchasing.
 await query("insert into product_options(id,product_id) values($1,$2)",[id(30),id(1)]);
 await query("insert into product_range_settings values($1,$2,true,'MANUAL')",[id(30),id(1)]);
 await query("insert into orders(id) values($1)",[id(31)]);
 await query("insert into order_items(id,order_id,product_id,product_option_id,quantity,denomination,fulfillment_mode) values($1,$2,$3,$4,1,500,'RANGE_MANUAL')",[id(32),id(31),id(1),id(30)]);
 assert.equal((await one("select count(*)::int n from definiteplay_jobs where item_id=$1",[id(32)])).n,0);

 await db.exec('set role authenticated');
 await reject("select claim_supplier_job('GIFTPORT')");
 await reject("select * from giftport_cards");
 await reject("update giftport_settings set mobile='1111111111'");
 await db.exec('reset role');
 await db.close();
 console.log('PASS: GiftPort PostgreSQL isolation, snapshots, paid-only claims, per-card markers, duplicate prevention, refund guards, complete delivery and permissions');
})().catch(e=>{console.error(e);process.exitCode=1});
