const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_PATH||'@electric-sql/pglite');
(async()=>{for(const version of ['legacy','seller']){const db=new PGlite();try{
 const fixture=fs.readFileSync('scripts/tests/order-number-checkout.cjs','utf8').match(/await db\.exec\(`([\s\S]*?)`\);/)[1];await db.exec(fixture);
 await db.exec(`alter table products add category_id uuid, add delivery_type text default 'AUTOMATIC', add stock_source text default 'OWNED', add stock_quantity integer default 0;
 alter table product_options add updated_at timestamptz default now(), add category_id uuid, add option_type text default 'CURRENCY', add is_custom_value boolean default false, add denomination_currency text default 'USD', add is_in_stock boolean default true, add sort_order int default 0;
 alter table order_items add id uuid default gen_random_uuid() primary key,add created_at timestamptz default now(),add service_delivered_at timestamptz,add seller_id uuid;
 create table admin_users(user_id uuid primary key);
 insert into admin_users values('00000000-0000-4000-8000-000000000010');
 create table gift_card_codes(id uuid primary key default gen_random_uuid(),product_id uuid,product_option_id uuid,order_item_id uuid,code text unique,status text,denomination numeric,reserved_at timestamptz,sold_at timestamptz,created_by uuid,created_at timestamptz default now(),updated_at timestamptz default now());
 create table order_item_refunds(order_item_id uuid,quantity integer,status text);
 create table definiteplay_stock(option_id uuid,product_id uuid,sku text,unit_cost numeric,available_quantity int,synced_at timestamptz);
 create table definiteplay_jobs(item_id uuid,order_id uuid,supplier_reference text,sku text,quantity int,max_unit_cost numeric);`);
 function getFunction(file,name){const text=fs.readFileSync(file,'utf8');const start=text.search(new RegExp('create (or replace )?function public\\.'+name+'\\(','i'));assert(start>=0,name);return text.slice(start,text.indexOf('$$;',start)+3);}
 await db.exec(getFunction('supabase/migrations/20260802_120000_use_product_quantity_limits.sql','create_store_order'));
 const supplier='supabase/migrations/20260925_150000_definiteplay_fulfillment.sql';
 for(const name of ['guard_order_item_combined_stock','snapshot_definiteplay_order_item'])await db.exec(getFunction(supplier,name));
 await db.exec(getFunction(version==='legacy'?'supabase/migrations/00000003_manual_payment_functions.sql':'scripts/tests/fixtures/seller-instant-fulfillment.sql','fulfill_instant_items'));
 const fulfillmentSignature='public.fulfill_instant_items(uuid)';
 await db.exec(`revoke all on function ${fulfillmentSignature} from public;grant execute on function ${fulfillmentSignature} to service_role;`);
 const definition=async()=> (await db.query(`select pg_get_functiondef('${fulfillmentSignature}'::regprocedure) as src`)).rows[0].src;
 const original=await definition();
 await db.exec(fs.readFileSync('supabase/migrations/20260919_233000_batch_manual_delivery.sql','utf8'));
 await db.exec(`create trigger guard_stock before insert on order_items for each row execute function guard_order_item_combined_stock();create trigger snapshot_supplier after insert on order_items for each row execute function snapshot_definiteplay_order_item();`);
 const sql=fs.readFileSync('supabase/migrations/20260928_160000_product_range_options.sql','utf8');await db.exec(sql);await db.exec(sql);
 const patched=await definition();
 const expected=version==='legacy'?original.replace("delivery_type = 'MANUAL'","(delivery_type = 'MANUAL' or v_item.fulfillment_mode = 'RANGE_MANUAL')"):original.replace("IF item.delivery_type='MANUAL' THEN","IF (item.delivery_type='MANUAL' OR item.fulfillment_mode='RANGE_MANUAL') THEN");
 assert.equal(patched,expected,'Only the manual-delivery condition should change');
 assert.equal((await db.query(`select has_function_privilege('anon','${fulfillmentSignature}','execute') as ok`)).rows[0].ok,false);
 assert.equal((await db.query(`select has_function_privilege('service_role','${fulfillmentSignature}','execute') as ok`)).rows[0].ok,true);
 const product='00000000-0000-4000-8000-000000000001',admin='00000000-0000-4000-8000-000000000010';
 const config={enabled:true,currency:'INR',minimum:100,maximum:10000,step:1,price_basis:1000,price_usd:12,delivery_mode:'MANUAL'};
 const save=c=>db.query('select save_product_range($1,$2,$3)',[product,admin,c]);
 await assert.rejects(db.query('select save_product_range($1,$2,$3)',[product,product,config]),/Administrator/);
 await save(config);
 const option=(await db.query('select option_id from product_range_settings')).rows[0].option_id;
 const order=(value,quantity=2)=>db.query("select create_store_order('Test buyer','test@example.com','','wallet',$1,null) as result",[JSON.stringify([{productOptionId:option,customValue:value,quantity,unitPrice:.01}])]);
 let created=(await order(1000)).rows[0].result;assert.equal(Number(created.total),24);
 let item=(await db.query('select * from order_items where order_id=$1',[created.id])).rows[0];assert.equal(item.fulfillment_mode,'RANGE_MANUAL');assert.match(item.option_name,/1000.*INR/);assert.equal(Number(item.unit_price),12);
 for(const amount of [99,10001,100.5,100.001,null])await assert.rejects(order(amount),/denomination/);
 await assert.rejects(order(100,11),/quantity/);
 await assert.rejects(db.query('select deliver_manual_codes_batch($1,$2,$3,$4)',[created.id,item.id,admin,['CODE-A','CODE-B']]),/paid/);
 await db.query("update orders set status='PAID' where id=$1",[created.id]);assert.equal((await db.query('select fulfill_instant_items($1) as manual',[created.id])).rows[0].manual,true);
 await db.query('select deliver_manual_codes_batch($1,$2,$3,$4)',[created.id,item.id,admin,['CODE-A','CODE-B']]);assert.equal((await db.query("select count(*)::int as n from gift_card_codes where status='SOLD'")).rows[0].n,2);
 await save({...config,enabled:false});await assert.rejects(order(1000),/unavailable/);
 await save({...config,enabled:true,currency:'USD',minimum:2,maximum:500,price_basis:100,price_usd:95});assert.equal(Number((await order(10,3)).rows[0].result.total),28.5);
 await db.exec("update products set stock_source='DEFINITEPLAY',delivery_type='MANUAL'");await order(20);assert.equal((await db.query('select count(*)::int as n from definiteplay_jobs')).rows[0].n,0,'Manual range must not generate a fixed SKU purchase');
 await assert.rejects(save({...config,delivery_mode:'SUPPLIER',supplier:'DEFINITEPLAY'}),/verified variable-value/);
 await save({...config,enabled:false,delivery_mode:'SUPPLIER',supplier:'DEFINITEPLAY'});
 assert.equal((await db.query("select has_function_privilege('anon','public.save_product_range(uuid,uuid,jsonb)','execute') as ok")).rows[0].ok,false);
 // Existing fixed inventory still fulfills, including reserved seller stock and retry safety.
 await db.exec("update products set stock_source='OWNED',delivery_type='AUTOMATIC'");
 const fixed='00000000-0000-4000-8000-000000000002';
 await db.query("insert into gift_card_codes(product_id,product_option_id,code,status) values($1,$2,'FIXED-A','AVAILABLE'),($1,$2,'FIXED-B','AVAILABLE')",[product,fixed]);
 const normal=(await db.query("select create_store_order('Buyer','buyer@example.com','','wallet',$1,null) as result",[JSON.stringify([{productOptionId:fixed,quantity:1}])])).rows[0].result;
 await db.query("update orders set status='PAID' where id=$1",[normal.id]);
 const normalItem=(await db.query('select id from order_items where order_id=$1',[normal.id])).rows[0].id;
 if(version==='seller'){
  await db.query('update order_items set seller_id=$1 where id=$2',[admin,normalItem]);
  await db.query("update gift_card_codes set status='RESERVED',order_item_id=$1 where code='FIXED-B'",[normalItem]);
 }
 assert.equal((await db.query('select fulfill_instant_items($1) as manual',[normal.id])).rows[0].manual,false);
 if(version==='seller'){
  await db.query('select fulfill_instant_items($1)',[normal.id]);
  assert.equal((await db.query("select status from gift_card_codes where code='FIXED-A'")).rows[0].status,'AVAILABLE');
  assert.equal((await db.query("select status from gift_card_codes where code='FIXED-B'")).rows[0].status,'SOLD');
 }
 assert.equal((await db.query("select count(*)::int as n from gift_card_codes where order_item_id=$1 and status='SOLD'",[normalItem])).rows[0].n,1);
 // An unknown function must fail and roll back the migration, never replace custom logic.
 const unknown=original.replaceAll("'MANUAL'","'CUSTOM'");await db.exec(unknown);
 await assert.rejects(db.exec(sql),/Unrecognised instant fulfillment/);await db.exec('rollback');
 assert.equal(await definition(),unknown);
 console.log(`PASS (${version}): range pricing, limits, delivery, unchanged fixed/seller fulfillment, permissions, repeat migration and unknown-function rollback.`);
}finally{await db.close();}}})().catch(e=>{console.error(e);process.exitCode=1;});
