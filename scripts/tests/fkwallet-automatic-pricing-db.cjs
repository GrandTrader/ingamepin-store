const fs=require('node:fs'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create type order_status as enum('PENDING_PAYMENT','PAYMENT_REVIEW','PAID','PROCESSING','DELIVERED','CANCELLED','REFUNDED');
 create table products(id uuid primary key,name text,price numeric default 20,seller_id uuid,stock_quantity int default 0,delivery_type text default 'MANUAL',allows_custom_value boolean default false,allows_player_id_topup boolean default false,updated_at timestamptz);
 create table product_options(id uuid primary key,product_id uuid references products(id),is_active boolean default true,is_custom_value boolean default false,denomination numeric default 1,denomination_currency text default 'USD',selling_price numeric default 20,stock_quantity int default 0,is_in_stock boolean default false,updated_at timestamptz);
 create table orders(id uuid primary key,status order_status default 'PENDING_PAYMENT',paid_at timestamptz,currency text default 'USD',subtotal numeric default 20,discount numeric default 0,total numeric default 20,delivered_at timestamptz,updated_at timestamptz);
 create table order_items(id uuid primary key,order_id uuid references orders(id),product_id uuid,product_option_id uuid,quantity int,custom_value numeric,fulfillment_mode text default 'CODE',service_delivered_at timestamptz,denomination numeric default 1,unit_price numeric default 20,total_price numeric default 20,customer_information jsonb default '[]');
 create table gift_card_codes(id uuid primary key default gen_random_uuid(),product_id uuid,product_option_id uuid,order_item_id uuid,denomination numeric,code text unique,status text,note text,reserved_at timestamptz,sold_at timestamptz);
 create table payments(order_id uuid,status text,currency text,amount numeric);
 create table order_item_refunds(order_id uuid,order_item_id uuid,status text,quantity int);
 create table order_refund_requests(order_id uuid,status text);
 create table fkwallet_imports(product_id uuid primary key references products,connection_id text,supplier_category_id bigint,exchange_rate numeric,markup_percent numeric default 5,customer_fields jsonb default '[]');
 create table fkwallet_product_links(option_id uuid primary key,product_id uuid references fkwallet_imports,connection_id text,supplier_product_id bigint,supplier_cost numeric,supplier_currency text,supplier_snapshot jsonb default '{}');
 create table product_customer_fields(id uuid primary key,product_id uuid,field_type text,is_required boolean);`);
 for(const file of ['20260918_234000_sync_code_inventory.sql','20260925_150000_definiteplay_fulfillment.sql','20260925_160000_fix_definiteplay_order_status_guard.sql','20261006_120000_giftport_fulfillment.sql'])await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await db.exec('create trigger stock_guard before insert on order_items for each row execute function guard_order_item_combined_stock()');
 await db.exec(fs.readFileSync('supabase/migrations/20261013_170000_fkwallet_fulfillment.sql','utf8'));
 const migration=fs.readFileSync('supabase/migrations/20261017_160000_fkwallet_automatic_pricing.sql','utf8');await db.exec(migration);await db.exec(migration);
 await db.exec(fs.readFileSync('supabase/migrations/20260801_150000_sync_product_price_from_options.sql','utf8'));
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),connection='a'.repeat(64),other='b'.repeat(64);
 const q=(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>(await q(sql,args)).rows[0];
 const reject=async(sql,args=[],message)=>assert.rejects(q(sql,args),message);
 async function product(n,markup=5,rate=88){
  await q('insert into products(id,name) values($1,$2)',[id(n),'Test '+n]);
  await q('insert into product_options(id,product_id) values($1,$2)',[id(n+1),id(n)]);
  await q('insert into fkwallet_imports(product_id,connection_id,supplier_category_id,exchange_rate,markup_percent) values($1,$2,59,$3,$4)',[id(n),connection,rate,markup]);
  await q("insert into fkwallet_product_links(option_id,product_id,connection_id,supplier_product_id,supplier_cost,supplier_currency,supplier_snapshot) values($1,$2,$3,9,880,'RUB',$4)",[id(n+1),id(n),connection,JSON.stringify({price:880,name:'Test supplier option'})]);
 }
 await product(1);await product(20,6,100);await product(30,0,88);
 await q('insert into fkwallet_worker_state(connection_id) values($1)',[connection]);
 await q("select configure_fkwallet_product($1,true,'CODE',$2)",[id(1),connection]);
 const row=(n,cost,quantity=10)=>({optionId:id(n+1),supplierId:9,supplierCost:String(cost),supplierCurrency:'RUB',quantity});
 const stamp=()=>new Date().toISOString();
 const sync=(n,rows,time=stamp(),account=connection)=>q('select sync_fkwallet_catalogue($1,$2,$3,$4) changed',[id(n),account,JSON.stringify(rows),time]);
 const state=async n=>one(`select o.selling_price,o.stock_quantity,o.is_in_stock,l.supplier_cost,l.supplier_snapshot,s.unit_cost,p.stock_source,p.price as base_price
  from product_options o join products p on p.id=o.product_id join fkwallet_product_links l on l.option_id=o.id left join definiteplay_stock s on s.option_id=o.id where o.id=$1`,[id(n+1)]);
 await sync(1,[row(1,880)]);
 assert.equal(Number((await state(1)).selling_price),10.5);
 // Preserve a pending order's price, budget, supplier payload and submission state.
 await q('insert into orders(id) values($1)',[id(100)]);
 await q('insert into order_items(id,order_id,product_id,product_option_id,quantity,unit_price,total_price) values($1,$2,$3,$4,1,10.5,10.5)',[id(101),id(100),id(1),id(2)]);
 const beforeJob=await one('select * from definiteplay_jobs where item_id=$1',[id(101)]),beforeItem=await one('select * from order_items where id=$1',[id(101)]);
 await db.exec('set role service_role');await sync(1,[row(1,1000,8)]);await db.exec('reset role');
 let current=await state(1);assert.equal(Number(current.selling_price),11.93);assert.equal(Number(current.supplier_cost),1000);assert.equal(Number(current.supplier_snapshot.price),1000);assert.equal(Number(current.unit_cost),11.36363637);assert.equal(current.stock_quantity,8);assert.equal(current.is_in_stock,true);assert.equal(Number(current.base_price),11.93);
 assert.deepEqual(await one('select * from definiteplay_jobs where item_id=$1',[id(101)]),beforeJob);assert.deepEqual(await one('select * from order_items where id=$1',[id(101)]),beforeItem);
 await q('insert into orders(id) values($1)',[id(110)]);
 await q('insert into order_items(id,order_id,product_id,product_option_id,quantity,unit_price,total_price) values($1,$2,$3,$4,1,11.93,11.93)',[id(111),id(110),id(1),id(2)]);
 const newJob=await one('select * from definiteplay_jobs where item_id=$1',[id(111)]);assert.equal(Number(newJob.max_unit_cost),11.36363637);assert.equal(newJob.supplier_payload.supplierCost,1000);
 // Rounding uses the saved percentage and rate independently for each product.
 await sync(1,[row(1,105)]);current=await state(1);assert.equal(Number(current.selling_price),1.25);assert.equal(current.is_in_stock,true);
 await sync(20,[row(20,105)]);current=await state(20);assert.equal(Number(current.selling_price),1.11);assert.equal(current.stock_source,'OWNED');assert.equal(current.stock_quantity,0);assert.equal(current.unit_cost,null);
 assert.equal((await one('select count(*)::int n from fkwallet_delivery_settings where product_id=$1',[id(20)])).n,0,'price sync does not enable delivery');
 await sync(30,[row(30,105)]);assert.equal(Number((await state(30)).selling_price),1.19);
 // No repeated markup compounding; a future fetch cannot be overwritten by a late one.
 const newer=new Date(Date.now()+10000).toISOString();await sync(1,[row(1,209)],newer);current=await state(1);assert.equal(Number(current.selling_price),2.49);await sync(1,[row(1,209)],newer);assert.deepEqual(await state(1),current);
 await sync(1,[row(1,5000)],stamp());assert.deepEqual(await state(1),current);
 await reject('select sync_fkwallet_catalogue($1,$2,$3,$4)',[id(1),connection,'[]',new Date(Date.now()-3600000).toISOString()],/Invalid FKWallet catalogue/);
 const fresh=new Date(Date.now()+20000).toISOString();
 // Every invalid snapshot rolls back all writes and preserves safe mappings.
 for(const rows of [[row(1,300),row(1,400)],[row(20,300)],[{...row(1,300),supplierId:999}],[{...row(1,300),supplierCurrency:'USD'}],[row(1,-1)],[row(1,'NaN')],[row(1,0)],[{optionId:id(2),quantity:2}]]){await assert.rejects(sync(1,rows,fresh));assert.deepEqual(await state(1),current);}
 await assert.rejects(sync(1,[row(1,300)],fresh,other));assert.deepEqual(await state(1),current);
 await q('insert into product_options(id,product_id) values($1,$2)',[id(3),id(1)]);
 await q("insert into fkwallet_product_links(option_id,product_id,connection_id,supplier_product_id,supplier_cost,supplier_currency) values($1,$2,$3,10,880,'RUB')",[id(3),id(1),connection]);
 await q("insert into definiteplay_stock(option_id,product_id,sku,unit_cost) values($1,$2,'FK10',10)",[id(3),id(1)]);
 await assert.rejects(sync(1,[row(1,400),{optionId:id(3),supplierId:10,supplierCost:'0',supplierCurrency:'RUB',quantity:1}],fresh));assert.deepEqual(await state(1),current,'later invalid row rolls back earlier price edits');
 // Insufficient funds changes costs/prices, but never advertises available units.
 await sync(1,[row(1,419,0)],fresh);current=await state(1);assert.equal(Number(current.selling_price),5);assert.equal(current.stock_quantity,0);
 await sync(1,[],new Date(Date.now()+30000).toISOString());assert.equal(Number((await state(1)).selling_price),5,'missing catalogue preserves price');
 // Normal edits cannot use the narrow refresh exception to remap products.
 await reject('update fkwallet_product_links set supplier_cost=900 where option_id=$1',[id(2)]);
 await reject('update fkwallet_imports set markup_percent=100 where product_id=$1',[id(1)]);
 await db.exec('begin');await q("select set_config('app.fkwallet_catalogue_sync',$1,true)",[id(1)]);
 await reject('update fkwallet_product_links set supplier_product_id=999 where option_id=$1',[id(2)]);await db.exec('rollback');
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);await assert.rejects(sync(1,[],stamp()),/permission denied/);await db.exec('reset role');}
 assert.equal((await one('select count(*)::int n from fkwallet_units where submitted_at is not null')).n,0,'price refresh submits no purchases');
 await db.close();console.log('PASS: atomic FKWallet pricing, saved markups/rates, rising/falling prices, stale protection, unchanged order snapshots, manual products, rollback and permissions');
})().catch(error=>{console.error(error);process.exitCode=1});
