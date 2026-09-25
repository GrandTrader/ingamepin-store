// Runs real PostgreSQL (PGlite) against an isolated minimal schema; no live DB.
const fs=require("node:fs"),path=require("node:path"),assert=require("node:assert/strict");
const {PGlite}=require(process.env.PGLITE_PATH || path.join(process.env.TEMP,"igp-dp-postgres-test/node_modules/@electric-sql/pglite"));
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
 const mappings=JSON.stringify([{optionId:id(2),sku:"APPLE10"}]);
 await assert.rejects(query("select configure_definiteplay_product($1,true,$2)",[id(1),mappings]),/invalid input value for enum order_status/);
 await db.exec(fs.readFileSync("supabase/migrations/20260925_160000_fix_definiteplay_order_status_guard.sql","utf8"));
 await query("select configure_definiteplay_product($1,true,$2)",[id(1),mappings]);
 assert.equal((await one("select stock_source from products")).stock_source,"DEFINITEPLAY");
 const rows=JSON.stringify([{sku:"APPLE10",currency:"USD",cost:"9.80",quantity:10}]);
 await query("select sync_definiteplay_stock($1,now())",[rows]);
 assert.equal((await one("select stock_quantity from products")).stock_quantity,10);
 // Owned-code recount must leave supplier availability alone.
 await query("select reconcile_code_inventory($1)",[id(1)]);
 assert.equal((await one("select stock_quantity from products")).stock_quantity,10);
 await reject("insert into gift_card_codes(product_id,code,status) values($1,'manual','AVAILABLE')",[id(1)]);
 await query("insert into orders(id) values($1)",[id(3)]);
 await query("insert into order_items(id,order_id,product_id,product_option_id,quantity,denomination) values($1,$2,$3,$4,1,10)",[id(4),id(3),id(1),id(2)]);
 assert.equal((await one("select count(*)::int n from definiteplay_jobs")).n,1);
 assert.equal((await one("select claim_definiteplay_job() job")).job,null,"unpaid must not claim");
 await query("update orders set status='PAID',paid_at=now() where id=$1",[id(3)]);
 assert.equal((await one("select claim_definiteplay_job() job")).job,null,"paid label alone is insufficient");
 await query("insert into payments values($1,'VERIFIED','USD',20)",[id(3)]);
 await query("update definiteplay_jobs set next_check=now()");
 const job=(await one("select claim_definiteplay_job() job")).job;
 assert.equal(job.sku,"APPLE10");
 assert.equal((await one("select claim_definiteplay_job() job")).job,null,"lease prevents second claim");
 await reject("select mark_definiteplay_submitted($1,null)",[id(4)]);
 await query("select mark_definiteplay_submitted($1,$2)",[id(4),job.lease_token]);
 await reject("select mark_definiteplay_submitted($1,$2)",[id(4),job.lease_token]);
 await reject("update orders set status='CANCELLED' where id=$1",[id(3)]);
 await reject("delete from order_items where id=$1",[id(4)]);
 await reject("insert into order_item_refunds values($1,$2,'CREDITED',1)",[id(3),id(4)]);
 await reject("update order_items set quantity=2 where id=$1",[id(4)]);
 await reject("select configure_definiteplay_product($1,false,'[]')",[id(1)]);
 await reject("select complete_definiteplay_job($1,$2,$3,11)",[id(4),job.lease_token,["TEST-CODE"]]);
 await query("select complete_definiteplay_job($1,$2,$3,9.80)",[id(4),job.lease_token,["TEST-CODE"]]);
 assert.equal((await one("select status from orders")).status,"DELIVERED");
 assert.equal((await one("select count(*)::int n from gift_card_codes")).n,1);
 await query("select complete_definiteplay_job($1,$2,$3,9.80)",[id(4),job.lease_token,["TEST-CODE"]]);
 assert.equal((await one("select count(*)::int n from gift_card_codes")).n,1);
 await reject("update gift_card_codes set status='AVAILABLE',order_item_id=null");
 await query("select sync_definiteplay_stock($1,now()-interval '16 minutes')",[rows]);
 assert.equal((await one("select stock_quantity from products")).stock_quantity,0);
 await query("insert into orders(id) values($1)",[id(5)]);
 await reject("insert into order_items(id,order_id,product_id,product_option_id,quantity) values($1,$2,$3,$4,1)",[id(6),id(5),id(1),id(2)]);
 // Same-currency guard and owned mode transition.
 await query("select sync_definiteplay_stock($1,now())",[JSON.stringify([{sku:"APPLE10",cost:"9",quantity:10,currency:"GBP"}])]);
 assert.equal((await one("select stock_quantity from products")).stock_quantity,0);
 await query("select configure_definiteplay_product($1,false,'[]')",[id(1)]);
 assert.equal((await one("select stock_source from products")).stock_source,"OWNED");
 // RPC permissions: signed-in shoppers cannot change supplier mode or purchase.
 await db.exec("set role authenticated");
 await reject("select claim_definiteplay_job()");
 await db.exec("reset role");
 await db.close();
 console.log("PASS: isolated PostgreSQL migration, stock, verified-payment claim, leases, refund/cancel guards, idempotent delivery and permissions");
})().catch(e=>{console.error(e.message);process.exitCode=1});
