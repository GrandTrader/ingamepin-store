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

 await db.exec("create table payment_gateway_settings(id boolean primary key,store_usd_inr_rate numeric); alter table product_options add column selling_price numeric default 9.99");
 await db.exec(fs.readFileSync("supabase/migrations/20261006_140000_giftport_discount_pricing.sql","utf8"));
 await reject("select save_giftport_pricing($1,0,10)",[id(1)]);
 await query("insert into payment_gateway_settings values(true,100.5)");
 for(const discount of ['-1','100','NaN','Infinity','1.234'])await reject("select save_giftport_pricing($1,$2,10)",[id(1),discount]);
 await reject("select save_giftport_pricing($1,0,0)",[id(1)]);
 await query("select save_giftport_pricing($1,0,10)",[id(1)]);
 assert.equal((await one("select stock_source from products where id=$1",[id(1)])).stock_source,'OWNED');
 await query("insert into giftport_settings(recipient_name,recipient_email,mobile) values('Business','orders@example.test','9876543210')");
 const mapping=JSON.stringify([{optionId:id(2),operatorCode:'AMZN',amount:'500',unitCost:0.000001,limit:999}]);
 await query("select configure_giftport_discount_product($1,$2,10,10)",[id(1),mapping]);
 assert.equal(Number((await one("select unit_cost from definiteplay_stock")).unit_cost),4.47761195,'server recomputes budget, ignoring supplied unit cost');
 await query("select save_giftport_pricing($1,0,10)",[id(1)]);
 assert.equal(Number((await one("select unit_cost from definiteplay_stock")).unit_cost),4.97512438);
 await query("select sync_giftport_stock($1)",[JSON.stringify([{optionId:id(2),quantity:10}])]);
 await query("insert into orders(id) values($1)",[id(3)]);
 await query("insert into order_items(id,order_id,product_id,product_option_id,quantity,denomination) values($1,$2,$3,$4,1,500)",[id(4),id(3),id(1),id(2)]);
 await query("update payment_gateway_settings set store_usd_inr_rate=50 where id");
 assert.equal(Number((await one("select unit_cost from definiteplay_stock")).unit_cost),10,'rate changes update costs automatically');
 assert.equal(Number((await one("select max_unit_cost from definiteplay_jobs where item_id=$1",[id(4)])).max_unit_cost),4.97512438,'previous orders retain checkout snapshot');
 await query("insert into orders(id) values($1)",[id(5)]);
 await query("insert into order_items(id,order_id,product_id,product_option_id,quantity,denomination) values($1,$2,$3,$4,1,500)",[id(6),id(5),id(1),id(2)]);
 assert.equal(Number((await one("select max_unit_cost from definiteplay_jobs where item_id=$1",[id(6)])).max_unit_cost),10,'new orders use new rate');
 await query("select save_giftport_pricing($1,20,2)",[id(1)]);
 assert.equal(Number((await one("select unit_cost from definiteplay_stock")).unit_cost),8);
 assert.equal(Number((await one("select max_unit_cost from definiteplay_jobs where item_id=$1",[id(6)])).max_unit_cost),10,'discount edits do not rewrite orders');
 assert.equal((await one("select available_quantity from definiteplay_stock")).available_quantity,2);
 assert.equal((await one("select stock_quantity from product_options where id=$1",[id(2)])).stock_quantity,2);
 assert.equal(Number((await one("select selling_price from product_options where id=$1",[id(2)])).selling_price),9.99,'selling price is not overwritten');
 await reject("update payment_gateway_settings set store_usd_inr_rate=0 where id");
 assert.equal(Number((await one("select store_usd_inr_rate from payment_gateway_settings")).store_usd_inr_rate),50);
 // Existing manual-budget products are not silently converted by applying SQL.
 await query("insert into products(id,name) values($1,'Legacy GiftPort')",[id(10)]);
 await query("insert into product_options(id,product_id) values($1,$2)",[id(11),id(10)]);
 await query("select configure_giftport_product($1,true,$2)",[id(10),JSON.stringify([{optionId:id(11),operatorCode:'AMZN',amount:'500',unitCost:6,limit:10}])]);
 await query("update payment_gateway_settings set store_usd_inr_rate=100 where id");
 assert.equal(Number((await one("select unit_cost from definiteplay_stock where product_id=$1",[id(10)])).unit_cost),6);
 assert.equal(Number((await one("select unit_cost from definiteplay_stock where product_id=$1",[id(1)])).unit_cost),4);
 await db.exec('set role authenticated');
 await reject("select save_giftport_pricing($1,0,10)",[id(1)]);
 await reject("select configure_giftport_discount_product($1,$2,0,10)",[id(1),mapping]);
 await reject("select * from giftport_product_pricing");
 await db.exec('reset role');
 await db.close();
 console.log('PASS: GiftPort discount validation, authoritative conversion, automatic rate updates, immutable order snapshots, retained selling prices, legacy costs and permissions');
})().catch(e=>{console.error(e);process.exitCode=1});
