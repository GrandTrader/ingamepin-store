const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const read=name=>fs.readFileSync('supabase/migrations/'+name,'utf8');
function fn(file,name){const source=read(file),start=source.search(new RegExp('create (or replace )?function public\\.'+name+'\\(','i'));assert(start>=0);return source.slice(start,source.indexOf('$$;',start)+3);}
(async()=>{for(const version of ['legacy','seller']){const db=new PGlite();try{
 await db.exec(fs.readFileSync('scripts/tests/order-number-checkout.cjs','utf8').match(/await db\.exec\(`([\s\S]*?)`\);/)[1]);
 await db.exec(`alter table products add category_id uuid,add denomination numeric,add seller_id uuid,add delivery_type text default 'AUTOMATIC',add stock_quantity integer default 0,add updated_at timestamptz;
 alter table product_options add updated_at timestamptz,add category_id uuid,add option_type text default 'CURRENCY',add is_custom_value boolean default false,add denomination_currency text default 'USD',add is_in_stock boolean default true,add sort_order int default 0;
 alter table orders add paid_at timestamptz,add delivered_at timestamptz,add updated_at timestamptz;
 alter table order_items add id uuid default gen_random_uuid() primary key,add created_at timestamptz default now(),add service_delivered_at timestamptz,add seller_id uuid;
 create table admin_users(user_id uuid primary key);insert into admin_users values('00000000-0000-4000-8000-000000000010');
 create table gift_card_codes(id uuid primary key default gen_random_uuid(),product_id uuid,product_option_id uuid,order_item_id uuid,code text unique,status text,denomination numeric,reserved_at timestamptz,sold_at timestamptz,created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now(),note text);
 create table order_item_refunds(order_id uuid,order_item_id uuid,quantity integer,status text);`);
 await db.exec(fn('20260802_120000_use_product_quantity_limits.sql','create_store_order'));
 await db.exec(read('20260918_234000_sync_code_inventory.sql'));
 await db.exec(read('20260925_150000_definiteplay_fulfillment.sql'));
 const instant=version==='legacy'?fn('00000003_manual_payment_functions.sql','fulfill_instant_items'):fs.readFileSync('scripts/tests/fixtures/seller-instant-fulfillment.sql','utf8');await db.exec(instant);
 await db.exec(read('20260919_233000_batch_manual_delivery.sql'));
 await db.exec('create trigger stock_guard before insert on order_items for each row execute function guard_order_item_combined_stock()');
 await db.exec(read('20260928_160000_product_range_options.sql'));
 const migration=read('20261007_220000_definiteplay_custom_value.sql');await db.exec(migration);await db.exec(migration);
 const percentageMigration=read('20261007_230000_range_percentage_pricing.sql');await db.exec(percentageMigration);await db.exec(percentageMigration);
 // Reproduce an already-installed function that the production safe-update rule rejects.
 await db.exec(`do $$declare src text;begin src:=pg_get_functiondef('public.sync_definiteplay_ranges(jsonb,timestamptz,boolean)'::regprocedure);execute replace(src,'update definiteplay_ranges set available=false where available=true;','update definiteplay_ranges set available=false;');end;$$;`);
 const safeUpdate=read('20261007_240000_range_sync_safe_update.sql');await db.exec(safeUpdate);await db.exec(safeUpdate);
 const definition=(await db.query("select pg_get_functiondef('public.sync_definiteplay_ranges(jsonb,timestamptz,boolean)'::regprocedure) as source")).rows[0].source;
 assert.ok(definition.includes('update definiteplay_ranges set available=false where available=true;'));
 assert.ok(!definition.includes('update definiteplay_ranges set available=false;'));
 const product='00000000-0000-4000-8000-000000000001',fixed='00000000-0000-4000-8000-000000000002',admin='00000000-0000-4000-8000-000000000010';
 const one=async(s,p=[]) => (await db.query(s,p)).rows[0];
 const config={enabled:false,currency:'USD',minimum:2,maximum:500,step:.01,price_basis:100,price_usd:103,delivery_mode:'SUPPLIER',supplier:'DEFINITEPLAY',supplier_reference:'OPEN-USD'};
 const save=c=>db.query('select save_product_range($1,$2,$3)',[product,admin,c]);
 const catalogue=[{sku:'OPEN-USD',cardCurrency:'USD',lowerLimit:'2',upperLimit:'500',minimumIncrement:'0.01',discount:'2.00%'}];
 const sync=()=>db.query('select sync_definiteplay_ranges($1,now(),true)',[JSON.stringify(catalogue)]);
 await save(config);
 const option=(await one('select option_id from product_range_settings')).option_id;
 await assert.rejects(save({...config,enabled:true}),/unavailable/);
 await sync();await save({...config,enabled:true});
 const fixedBefore=await one('select * from product_options where id=$1',[fixed]);
 assert.equal(fixedBefore.option_name,'10 USD');assert.equal((await one('select stock_source from products')).stock_source,'OWNED');
 assert.equal((await one('select definiteplay_range_limits($1) as limits',[[option]])).limits[0].quantity,1000);
 const order=(value,qty=1)=>db.query("select create_store_order('Test','test@example.com','','wallet',$1,null) as result",[JSON.stringify([{productOptionId:option,quantity:qty,customValue:value,unitPrice:.01}])]);
 const created=(await order(27.35,2)).rows[0].result;
 const item=await one('select * from order_items where order_id=$1',[created.id]);
 const job=await one('select * from definiteplay_jobs where item_id=$1',[item.id]);
 assert.equal(Number(item.unit_price),28.17);assert.equal(item.fulfillment_mode,'RANGE_SUPPLIER');assert.equal(Number(item.denomination),27.35);
 assert.equal(Number(job.card_value),27.35);assert.equal(job.card_currency,'USD');assert.equal(job.sku,'OPEN-USD');assert.equal(Number(job.max_unit_cost),26.81);
 assert.equal((await one('select claim_definiteplay_job() as job')).job,null,'Unpaid range cannot purchase');
 for(const value of [1,501,2.001,null])await assert.rejects(order(value),/denomination/);
 await assert.rejects(order(27.35,11),/quantity/);
 await assert.rejects(db.query('update order_items set custom_value=28 where id=$1',[item.id]),/cannot be changed/);
 await assert.rejects(db.query("update order_items set fulfillment_mode='RANGE_MANUAL' where id=$1",[item.id]),/cannot be changed/);
 await db.query("update orders set status='PAID',paid_at=now() where id=$1",[created.id]);await db.query("update payments set status='VERIFIED' where order_id=$1",[created.id]);
 await db.query('select fulfill_instant_items($1)',[created.id]);assert.equal(Number((await one('select count(*) as n from gift_card_codes where order_item_id=$1',[item.id])).n),0,'Range never consumes fixed stock');
 const claimed=(await one('select claim_definiteplay_job() as job')).job;assert.equal(claimed.card_currency,'USD');
 await db.query('select mark_definiteplay_submitted($1,$2)',[item.id,claimed.lease_token]);
 await assert.rejects(db.query('select mark_definiteplay_submitted($1,$2)',[item.id,claimed.lease_token]));
 await assert.rejects(db.query("update orders set status='CANCELLED' where id=$1",[created.id]),/pending supplier/);
 await assert.rejects(db.query("insert into order_item_refunds values($1,$2,1,'CREDITED')",[created.id,item.id]),/supplier purchase/);
 await save({...config,enabled:false,supplier_reference:'OTHER'});
 assert.equal((await one('select sku from definiteplay_jobs where item_id=$1',[item.id])).sku,'OPEN-USD','Later edits do not alter paid jobs');
 await db.query('select complete_definiteplay_job($1,$2,$3,$4)',[item.id,claimed.lease_token,['RANGE-CODE-1','RANGE-CODE-2'],53.62]);
 await db.query('select complete_definiteplay_job($1,$2,$3,$4)',[item.id,claimed.lease_token,['RANGE-CODE-1','RANGE-CODE-2'],53.62]);
 assert.equal((await one('select status from orders where id=$1',[created.id])).status,'DELIVERED');
 assert.equal(Number((await one('select count(*) as n from gift_card_codes where order_item_id=$1',[item.id])).n),2);
 await save({...config,enabled:true});
 await db.exec("update definiteplay_ranges set worker_seen_at=now()-interval '3 minutes'");await assert.rejects(order(20),/unavailable/);
 await sync();await db.exec("update definiteplay_ranges set synced_at=now()-interval '16 minutes'");await assert.rejects(order(20),/unavailable/);
 await sync();await db.exec("update definiteplay_ranges set currency='GBP'");await assert.rejects(order(20),/currency/);
 await sync();await db.exec("update definiteplay_ranges set discount=-10");await assert.rejects(order(20),/selling price/);
 await sync();await db.exec("update definiteplay_ranges set step=1");await assert.rejects(order(20),/limits changed/);
 await sync();await db.query('select sync_definiteplay_ranges($1,now(),true)',['[]']);await assert.rejects(order(20),/unavailable/);
 for(const signature of ['sync_definiteplay_ranges(jsonb,timestamptz,boolean)','definiteplay_range_limits(uuid[])','definiteplay_range_cost(uuid,numeric)'])assert.equal((await one('select has_function_privilege($1,$2,$3) as ok',['anon','public.'+signature,'execute'])).ok,false);
 // Manual ranges still save and place orders without supplier jobs.
 await save({...config,enabled:true,delivery_mode:'MANUAL'});const manual=(await order(40)).rows[0].result;
 assert.equal(Number((await one('select count(*) as n from definiteplay_jobs where order_id=$1',[manual.id])).n),0);
 assert.deepEqual(await one('select * from product_options where id=$1',[fixed]),fixedBefore);
 // Percentage rates survive reload and supplier updates, without exposing private markup data.
 await sync();
 const savePercent=changes=>db.query('select save_supplier_range_percentage($1,$2,$3)',[product,admin,{...config,enabled:true,markup_percent:5,supplier_discount_percent:2,price_usd:.01,...changes}]);
 await savePercent();
 let priced=await one('select * from product_range_settings');
 assert.equal(Number(priced.supplier_markup_percent),5);assert.equal(Number(priced.price_usd),102.9);assert.equal(priced.price_rounding,'UP');
 assert.equal(Number((await one('select range_order_price($1,100) as price',[option])).price),102.9);
 assert.equal(Number((await one('select range_order_price($1,27.35) as price',[option])).price),28.15);
 const percentOrder=(await order(27.35)).rows[0].result;
 assert.equal(Number((await one('select unit_price from order_items where order_id=$1',[percentOrder.id])).unit_price),28.15);
 const snapshotted=await one('select max_unit_cost from definiteplay_jobs where order_id=$1',[percentOrder.id]);
 for(const markup of [-1,1001,5.001,'NaN',null])await assert.rejects(savePercent({markup_percent:markup}),/markup/);
 await assert.rejects(savePercent({supplier_discount_percent:3}),/pricing changed/);
 await assert.rejects(savePercent({currency:'GBP'}),/USD billing/);
 await assert.rejects(db.query('select save_supplier_range_percentage($1,$2,$3)',[product,product,{...config,markup_percent:5,supplier_discount_percent:2}]),/Administrator/);
 catalogue[0].discount='1.00%';await sync();
 priced=await one('select * from product_range_settings');assert.equal(Number(priced.supplier_markup_percent),5);assert.equal(Number(priced.price_usd),103.95);
 assert.equal(Number((await one('select range_order_price($1,100) as price',[option])).price),103.95);
 assert.equal(Number((await one('select unit_price from order_items where order_id=$1',[percentOrder.id])).unit_price),28.15,'New costs cannot reprice an existing order');
 assert.deepEqual(await one('select max_unit_cost from definiteplay_jobs where order_id=$1',[percentOrder.id]),snapshotted);
 // JS previews and SQL totals agree across sub-cent rates, zero markup and supplier surcharges.
 const vm=require('node:vm'),ts=require('typescript');
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/product-range.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require,FormData});
 for(const discount of ['2.00%','-2.50%','1.123456%']){
  catalogue[0].discount=discount;await sync();
  for(const markup of [0,0.01,5,5.55,1000]){
   await savePercent({markup_percent:markup,supplier_discount_percent:parseFloat(discount)});
   const r=await one('select * from product_range_settings');
   for(const amount of [2,2.01,27.35,99.99,100,499.99,500]){
    const actual=Number((await one('select range_order_price($1,$2) as price',[option,amount])).price);
    assert.equal(exports.rangePrice(r,amount),actual,`${discount}/${markup}%/${amount}: browser and database agree`);
   }
  }
 }
 assert.equal((await one("select has_function_privilege('anon','public.save_supplier_range_percentage(uuid,uuid,jsonb)','execute') as ok")).ok,false);
 await save({...config,enabled:true,delivery_mode:'MANUAL'});
 priced=await one('select * from product_range_settings');assert.equal(priced.supplier_markup_percent,null);assert.equal(priced.price_rounding,'NEAREST');
 assert.deepEqual(await one('select * from product_options where id=$1',[fixed]),fixedBefore);
 console.log(`PASS (${version}): existing-product import preserves fixed options; exact custom value, paid gate, cost cap, stale/foreign gating, immutable mapping, code delivery, duplicate protection and manual compatibility.`);
}finally{await db.close();}}})().catch(e=>{console.error(e.message);process.exitCode=1;});
