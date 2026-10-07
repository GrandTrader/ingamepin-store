// Isolated PostgreSQL tests: no live services or orders.
const fs=require('node:fs'),assert=require('node:assert/strict');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{
 const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role;
 create table products(id uuid primary key,stock_source text default 'DEFINITEPLAY',seller_id uuid,price numeric(12,2),stock_quantity int,updated_at timestamptz);
 create table product_options(id uuid primary key,product_id uuid references products(id),selling_price numeric(12,2),denomination_currency text,is_custom_value boolean default false,is_active boolean default true,stock_quantity int,is_in_stock boolean,updated_at timestamptz);
 create table definiteplay_stock(option_id uuid primary key references product_options(id),product_id uuid references products(id),sku text,unit_cost numeric(20,8),currency text default 'USD',available_quantity int,synced_at timestamptz default now());
 create table order_items(id int primary key,unit_price numeric,total_price numeric);
 create table definiteplay_jobs(item_id int primary key,max_unit_cost numeric);
 insert into order_items values(1,11,22);insert into definiteplay_jobs values(1,10);`);
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const one=async(sql,p=[]) => (await db.query(sql,p)).rows[0];
 for(const [n,cost,price,currency,source,custom] of [[1,10,11,'GBP','DEFINITEPLAY',false],[2,20,26,'EUR','DEFINITEPLAY',false],[3,10,15,'USD','OWNED',false],[4,10,25,'USD','DEFINITEPLAY',true]]){
  await db.query('insert into products(id,stock_source) values($1,$2)',[id(n),source]);
  await db.query('insert into product_options(id,product_id,selling_price,denomination_currency,is_custom_value) values($1,$1,$2,$3,$4)',[id(n),price,currency,custom]);
  await db.query('insert into definiteplay_stock(option_id,product_id,sku,unit_cost) values($1,$1,$2,$3)',[id(n),'SKU'+n,cost]);
 }
 await db.exec(fs.readFileSync('supabase/migrations/20260801_150000_sync_product_price_from_options.sql','utf8'));
 const migration=fs.readFileSync('supabase/migrations/20261008_010000_supplier_fixed_markup.sql','utf8');
 await db.exec(migration);await db.exec(migration);
 assert.equal((await one('select count(*)::int n from definiteplay_price_rules')).n,2);
 const price=async n=>Number((await one('select selling_price from product_options where id=$1',[id(n)])).selling_price);
 assert.equal(await price(1),11);assert.equal(await price(2),26);
 const rows=(a=12,b=18)=>[{sku:'SKU1',cost:a,currency:'USD',quantity:10},{sku:'SKU2',cost:b,currency:'USD',quantity:10},{sku:'SKU3',cost:30,currency:'USD',quantity:10},{sku:'SKU4',cost:30,currency:'USD',quantity:10}];
 const sync=async(values=rows(),time='now()')=>db.query('select sync_definiteplay_stock($1,'+time+')',[JSON.stringify(values)]);
 await sync();assert.equal(await price(1),13.2);assert.equal(await price(2),23.4);assert.equal(await price(3),15);assert.equal(await price(4),25);
 assert.equal(Number((await one('select price from products where id=$1',[id(1)])).price),13.2);
 assert.equal(Number((await one('select unit_price from order_items')).unit_price),11);assert.equal(Number((await one('select max_unit_cost from definiteplay_jobs')).max_unit_cost),10);
 // Repeated rounded updates must not compound or redefine the percentage.
 for(const cost of [12.34,7.99,101.29,8.21,10])await sync(rows(cost));
 assert.equal(await price(1),11);assert.equal(Number((await one('select base_unit_cost from definiteplay_price_rules where option_id=$1',[id(1)])).base_unit_cost),10);
 // Direct admin price editing intentionally establishes a new percentage.
 await db.query('update product_options set selling_price=12 where id=$1',[id(1)]);
 await sync(rows(20));assert.equal(await price(1),24);
 // An older catalogue cannot roll back the new price.
 await sync(rows(2),"now()-interval '2 minutes'");assert.equal(await price(1),24);
 // Missing/invalid costs retain the price and markup while removing availability.
 await sync([{sku:'SKU1',cost:9,currency:'GBP',quantity:10}]);assert.equal(await price(1),24);
 assert.equal(Number((await one('select stock_quantity from product_options where id=$1',[id(1)])).stock_quantity),0);
 await assert.rejects(db.query('update product_options set selling_price=25 where id=$1',[id(1)]),/Refresh supplier prices/);
 await sync(rows(10));assert.equal(await price(1),12);
 // New imported products preserve their chosen percentage, not their rounded effective margin.
 await db.query('insert into products(id) values($1)',[id(5)]);
 await db.query('insert into product_options(id,product_id,selling_price) values($1,$1,10.29)',[id(5)]);
 await db.query("insert into definiteplay_price_rules values($1,'SKU5',100,105,10.29,now())",[id(5)]);
 await db.query("insert into definiteplay_stock(option_id,product_id,sku,unit_cost,synced_at) values($1,$1,'SKU5',0,'epoch')",[id(5)]);
 await sync([...rows(),{sku:'SKU5',cost:12,currency:'USD',quantity:3}]);assert.equal(await price(5),12.6);
 // Do not reuse a different SKU's prior price rule.
 await db.query("update definiteplay_stock set sku='NEW5',unit_cost=0,synced_at='epoch' where option_id=$1",[id(5)]);
 await sync([...rows(),{sku:'NEW5',cost:7,currency:'USD',quantity:3}]);assert.equal(await price(5),12.6);
 await sync([...rows(),{sku:'NEW5',cost:14,currency:'USD',quantity:3}]);assert.equal(await price(5),25.2);
 await assert.rejects(sync(rows(),"now()+interval '2 minutes'"),/snapshot time/);
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await assert.rejects(db.query('select * from definiteplay_price_rules'),/permission denied/);
  await assert.rejects(sync(),/permission denied/);
  await db.exec('reset role');
 }
 console.log('PASS: preserved individual markups, upward/downward repricing, no rounding drift, manual edits, import markup, SKU changes, stale/invalid costs, unchanged orders, private costs and RPC permissions');
 }finally{await db.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
