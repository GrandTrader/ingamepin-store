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
 await db.exec("create schema auth; create table auth.users(id uuid primary key);\ninsert into auth.users values ('00000000-0000-4000-8000-000000090000');\ncreate table admin_users(user_id uuid primary key references auth.users);\ninsert into admin_users select id from auth.users;\ncreate table categories(id uuid primary key,name text,category_type text,is_active boolean);\ninsert into categories values('00000000-0000-4000-8000-000000090001','Games','GIFT_CARD',true);\nalter table products add column slug text unique,add column category_id uuid,add column name_ru text,add column description text,add column description_ru text,add column region text,add column product_type text,add column is_bulk_order boolean,add column currency text,add column price numeric,add column status text,add column is_featured boolean,add column allows_fixed_values boolean,add column allows_gaming_voucher boolean,add column minimum_quantity int,add column maximum_quantity int,add column sold_count int;\nalter table product_options add column category_id uuid,add column option_type text,add column option_name text,add column selling_price numeric default 20,add column sort_order int;\nalter table product_customer_fields add column label text,add column placeholder text,add column sort_order int;\n");
 await db.exec(fs.readFileSync('supabase/install/wupex.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/install/wupex.sql','utf8'));
 const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),connection='a'.repeat(64);
 const q=(sql,args=[])=>db.query(sql,args),one=async(sql,args=[])=>(await q(sql,args)).rows[0],reject=async(sql,args=[])=>assert.rejects(q(sql,args));

 await db.exec(`alter table fkwallet_imports add column imported_by uuid,add column markup_percent numeric default 10,add column created_at timestamptz default now();
 alter table fkwallet_product_links add column supplier_snapshot jsonb;
 create table product_range_settings(product_id uuid,enabled boolean);
 create table digiseller_supplier_jobs(invoice_id bigint primary key,option_id uuid,state text);
 create table digiseller_fkwallet_jobs(invoice_id bigint primary key,option_id uuid,state text);
 create table digiseller_fkwallet_products(digiseller_product_id bigint,product_id uuid references fkwallet_imports(product_id),ready boolean);
 `);
 for(const file of ['20261008_010000_supplier_fixed_markup.sql','20261017_160000_fkwallet_automatic_pricing.sql','20261026_120000_supplier_switching.sql']) await db.exec(fs.readFileSync('supabase/migrations/'+file,'utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261026_120000_supplier_switching.sql','utf8'));


 // Use the installed range snapshot and stock branch too, so fixed fallback
 // cannot silently replace custom-range fulfilment.
 await db.exec('alter table definiteplay_jobs add column card_value numeric,add column card_currency text; alter table product_range_settings add column option_id uuid,add column supplier_reference text,add column currency text;');
 await db.exec("create function definiteplay_range_cost(uuid,numeric) returns numeric language sql as $$select $2*0.9$$");
 const rangeSource=fs.readFileSync('supabase/migrations/20261007_220000_definiteplay_custom_value.sql','utf8');
 const rangeStart=rangeSource.indexOf('create or replace function public.snapshot_definiteplay_order_item()');
 await db.exec(rangeSource.slice(rangeStart,rangeSource.indexOf('$$;',rangeStart)+3));
 const guardStart=rangeSource.indexOf(" fn:='public.guard_order_item_combined_stock()'");
 const guardEnd=rangeSource.indexOf(" fn:='public.fulfill_instant_items",guardStart);
 await db.exec('do $$declare src text;fn regprocedure;begin\n'+rangeSource.slice(guardStart,guardEnd)+'\nend $$;');
 await db.exec(fs.readFileSync('supabase/migrations/20261026_210000_supplier_uploaded_backup.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261026_210000_supplier_uploaded_backup.sql','utf8'));
 for(let n=0;n<2;n++)await db.exec(fs.readFileSync('supabase/migrations/20261026_220000_supplier_uploaded_only.sql','utf8'));
 const makeProduct=async(n,provider='DEFINITEPLAY',kind='CODE')=>{
  const pid=id(n),oid=id(n+1);
  await q("insert into products(id,name,slug,category_id,region,currency) values($1,'Backup fixture',$2,$3,'Global','USD')",[pid,'backup-'+n,id(90001)]);
  await q("insert into product_options(id,product_id,option_name,denomination,denomination_currency,selling_price,is_active,option_type) values($1,$2,'10 USD',10,'USD',11,true,'CURRENCY')",[oid,pid]);
  if(provider==='DEFINITEPLAY'){
   await q("select configure_definiteplay_product($1,true,$2)",[pid,JSON.stringify([{optionId:oid,sku:'BACK'+n}])]);
  }else{
   await q('insert into '+(provider==='WUPEX'?'wupex':'fkwallet')+'_worker_state(connection_id) values($1) on conflict(id) do update set seen_at=now()',[connection]);
   const draft={markup:'10',exchangeRate:'1',kind,customerFields:kind==='CODE'?[]:[{key:'user',label:'Player ID',placeholder:'Player ID',fieldType:'TEXT',isRequired:true}],
    options:[{supplierKey:String(n),optionId:oid,name:'10 USD',denomination:'10',currency:'USD',supplierCost:'10',supplierCurrency:'USD',price:'11.00',
     supplierSnapshot:provider==='WUPEX'?{id:n,sku:'BACK'+n,name:'10 USD',cardType:kind==='CODE'?'voucher':'topup',subType:null,fields:[]}:{id:n,name:'10 USD',fields:[]}}]};
   const version=(await one('select product_supplier_version($1) v',[pid])).v;
   await q('select apply_product_supplier_configuration($1,$2,$3,$4,$5,$6,$7,$8)',[id(n+2),pid,id(90000),version,provider,connection,JSON.stringify(draft),JSON.stringify({provider,category:'10',options:[]})]);
  }
  await q("update definiteplay_stock set unit_cost=10,available_quantity=0,synced_at=now() where option_id=$1",[oid]);
  return {pid,oid};
 };
 const upload=async(p,n)=>{for(let k=0;k<n;k++)await q("insert into gift_card_codes(product_id,product_option_id,denomination,code,status) values($1,$2,10,$3,'AVAILABLE')",[p.pid,p.oid,crypto.randomUUID()]);};
 const stock=async(p,qty)=>q('update definiteplay_stock set available_quantity=$2,synced_at=now() where option_id=$1',[p.oid,qty]);
 const quantity=async p=>Number((await one('select supplier_available_quantity($1) n',[p.oid])).n);
 const order=async(p,n,qty=1)=>{
  const total=11*qty;
  await q('insert into orders(id,total,subtotal) values($1,$2,$2)',[id(n),total]);
  await q('insert into order_items(id,order_id,product_id,product_option_id,denomination,quantity,total_price,unit_price) values($1,$2,$3,$4,10,$5,$6,11)',[id(n+1),id(n),p.pid,p.oid,qty,total]);
  return {order:id(n),item:id(n+1),total};
 };
 const pay=async o=>{await db.exec('begin');await q("insert into payments(order_id,status,currency,amount) values($1,'VERIFIED','USD',$2)",[o.order,o.total]);await q("update orders set status='PAID',paid_at=now() where id=$1",[o.order]);await db.exec('commit');};
 const sold=async o=>Number((await one("select count(*) n from gift_card_codes where order_item_id=$1 and status='SOLD'",[o.item])).n);
 const job=async o=>one('select * from definiteplay_jobs where item_id=$1',[o.item]);
 for(const [index,provider] of ['DEFINITEPLAY','WUPEX','FKWALLET'].entries()){
  const base=1000+index*100,p=await makeProduct(base,provider);
  await upload(p,3);
  assert.equal(await quantity(p),3,provider+' backup availability');
  assert.equal((await one('select stock_quantity,is_in_stock from product_options where id=$1',[p.oid])).is_in_stock,true);
  await stock(p,5);assert.equal(await quantity(p),5,'never add supplier and uploaded counts');
  const supplierOrder=await order(p,base+10);
  await pay(supplierOrder);assert.equal(await sold(supplierOrder),0,'supplier preferred');
  await q("update orders set status='CANCELLED' where id=$1",[supplierOrder.order]);
  await stock(p,0);
  await q("update definiteplay_stock set unit_cost=0,synced_at='epoch' where option_id=$1",[p.oid]);
  const backupOrder=await order(p,base+20,2);
  assert.equal((await job(backupOrder)).uploaded_backup_only,true);
  assert.equal(await sold(backupOrder),0,'no delivery before verified payment');
  await pay(backupOrder);
  assert.equal(await sold(backupOrder),2,provider+' automatic delivery');
  assert.equal((await job(backupOrder)).delivery_source,'UPLOADED_STOCK');
  assert.equal((await one('select status from orders where id=$1',[backupOrder.order])).status,'DELIVERED');
  assert.equal(await quantity(p),1);
  await q('select deliver_uploaded_supplier_backup($1)',[backupOrder.item]);
  await q('select fulfill_uploaded_supplier_backups(25)');
  assert.equal(await sold(backupOrder),2,'idempotent delivery');
  await stock(p,8);
  assert.equal(await quantity(p),1,'zero supplier cost is unavailable');
  await q('update definiteplay_stock set unit_cost=10 where option_id=$1',[p.oid]);
  assert.equal(await quantity(p),8,'supplier restock restores priority');
  await assert.rejects(q("insert into gift_card_codes(product_id,product_option_id,denomination,code,status) values($1,$2,50,'WRONG-'||$3,'AVAILABLE')",[p.pid,p.oid,String(base)]),/active, matching supplier voucher/);
 }
 // Stock disappearing after checkout also falls back, before any external submission.
 const p=await makeProduct(2000);await upload(p,8);await stock(p,10);
 const changed=await order(p,2010,2);await stock(p,0);await pay(changed);assert.equal(await sold(changed),2);
 // Submitted, uncertain, refund, cancelled, wrong currency and active lease must never fall back.
 await stock(p,10);
 const protectedOrders=[];
 for(let n=0;n<6;n++)protectedOrders.push(await order(p,2030+n*10));
 await q("update definiteplay_jobs set submitted_at=now(),state='SUBMITTED' where item_id=$1",[protectedOrders[0].item]);
 await q("update definiteplay_jobs set state='UNCERTAIN' where item_id=$1",[protectedOrders[1].item]);
 await q("insert into order_refund_requests(order_id,status) values($1,'REQUESTED')",[protectedOrders[2].order]);
 await q("update definiteplay_jobs set lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes' where item_id=$1",[protectedOrders[5].item]);
 await stock(p,0);
 for(const o of protectedOrders)await pay(o);
 // Cancelled and non-USD cases use unpaid rows to avoid an earlier legitimate delivery.
 const cancel=await order(p,2100);await q("update orders set status='CANCELLED',paid_at=now() where id=$1",[cancel.order]);
 await q("insert into payments(order_id,status,currency,amount) values($1,'VERIFIED','USD',$2)",[cancel.order,cancel.total]);
 assert.equal(await sold(cancel),0);
 const currency=await order(p,2110);await q("update orders set currency='RUB' where id=$1",[currency.order]);await pay(currency);assert.equal(await sold(currency),0);
 for(const ix of [0,1,2,5])assert.equal(await sold(protectedOrders[ix]),0,'protected order '+ix);
 // A fully uploaded order cannot accidentally be leased for a supplier POST.
 const only=await order(p,2120);
 await q("update definiteplay_jobs set lease_token=gen_random_uuid(),lease_until=now()+interval '5 minutes' where item_id=$1",[only.item]);
 await pay(only);await q("update definiteplay_jobs set lease_until='epoch' where item_id=$1",[only.item]);
 await q("update definiteplay_jobs set next_check=now()+interval '1 day' where item_id<>$1",[only.item]);
 await q('select claim_supplier_job($1)',['DEFINITEPLAY']);
 assert.equal((await job(only)).state,'DELIVERED');assert.equal(await sold(only),1);
 // An insufficient backup never sends a partial batch. Replenishment completes the original order.
 const small=await makeProduct(3000);await upload(small,2);const waiting=await order(small,3010,2);
 await q("update gift_card_codes set status='DISABLED' where id=(select id from gift_card_codes where product_id=$1 limit 1)",[small.pid]);
 await pay(waiting);assert.equal(await sold(waiting),0);await upload(small,1);
 await q('select fulfill_uploaded_supplier_backups(100)');assert.equal(await sold(waiting),2);
 // All quantities were consumed once; separate customers cannot receive the same code.
 const race=await makeProduct(4000);await upload(race,1);
 const a=await order(race,4010),b=await order(race,4020);await pay(a);await pay(b);
 assert.equal(await sold(a)+await sold(b),1);
 // Account top-ups have no compatible uploaded-code fulfilment.
 const account=await makeProduct(5000,'FKWALLET','ACCOUNT');
 assert.equal((await one('select supplier_backup_option($1) yes',[account.oid])).yes,false);
 await assert.rejects(upload(account,1),/active, matching supplier voucher/);

 // Catalogue sync functions also update option counts after writing supplier stock.
 // The deferred reconciliation must win, without losing the uploaded backup.
 const synced=await makeProduct(6000);await upload(synced,3);
 await q('select sync_definiteplay_stock($1,now())',[JSON.stringify([{sku:'BACK6000',currency:'USD',cost:10,quantity:0}])]);
 assert.equal((await one('select stock_quantity from product_options where id=$1',[synced.oid])).stock_quantity,3);
 await q('select sync_definiteplay_stock($1,now())',[JSON.stringify([{sku:'BACK6000',currency:'USD',cost:10,quantity:7}])]);
 assert.equal((await one('select stock_quantity from product_options where id=$1',[synced.oid])).stock_quantity,7);
 // Preserving existing uploaded stock requires an explicit matching option.
 const v=async()=>(await one('select product_supplier_version($1) v',[synced.pid])).v;
 const switchDraft={markup:'10',exchangeRate:'1',kind:'CODE',customerFields:[],options:[{
  supplierKey:'6001',optionId:synced.oid,name:'10 USD',denomination:'10',currency:'USD',supplierCost:'10',supplierCurrency:'USD',price:'11.00',
  supplierSnapshot:{id:6001,sku:'MATCHED',name:'10 USD',cardType:'voucher',subType:null,fields:[]}}]};
 const switchProduct=async(n,d)=>{d={...d,uploadedOptions:(await one('select supplier_uploaded_options_to_keep($1,$2) v',[synced.pid,JSON.stringify(d.options)])).v};return q('select apply_product_supplier_configuration($1,$2,$3,$4,$5,$6,$7,$8)',
  [id(n),synced.pid,id(90000),await v(),'WUPEX',connection,JSON.stringify(d),JSON.stringify({provider:'WUPEX',options:[]})]);};
 await assert.rejects(switchProduct(6005,{...switchDraft,options:[{...switchDraft.options[0],optionId:null}]}),/Match the existing uploaded denomination/);
 await assert.rejects(switchProduct(6005,{...switchDraft,options:[{...switchDraft.options[0],denomination:'20'}]}),/same denomination/);
 await switchProduct(6005,switchDraft);
 assert.equal((await one("select count(*)::int n from gift_card_codes where product_id=$1 and status='AVAILABLE'",[synced.pid])).n,3);
 assert.equal(await quantity(synced),3);
 // Partial external submissions remain with that supplier, even if a parent marker is missing.
 const partial=await makeProduct(7000,'WUPEX');await stock(partial,3);await upload(partial,3);
 const partialOrder=await order(partial,7010,2);
 await q("update wupex_units set submitted_at=now(),provider_id='purchase-existing' where item_id=$1 and ordinal=1",[partialOrder.item]);
 await stock(partial,0);await pay(partialOrder);assert.equal(await sold(partialOrder),0);
 // Forged manual assignment and direct supplier submission are both blocked.
 const unsigned=await order(synced,6100);
 await assert.rejects(q("update gift_card_codes set status='SOLD',order_item_id=$1 where id=(select id from gift_card_codes where product_id=$2 and status='AVAILABLE' limit 1)",[unsigned.item,synced.pid]),/cannot be assigned manually/);
 await q("update definiteplay_jobs set lease_token=$2,lease_until=now()+interval '5 minutes' where item_id=$1",[unsigned.item,id(6199)]);
 await assert.rejects(q('select mark_wupex_unit_submitted($1,$2,1,$3)',[unsigned.item,id(6199),'encrypted-fixture']),/Lease was lost/);
 // Bulk import remains bounded and commits the final quantity once.
 const bulk=await makeProduct(8000);
 const started=Date.now();
 await q("insert into gift_card_codes(product_id,product_option_id,denomination,code,status) select $1,$2,10,'BULK-'||n,'AVAILABLE' from generate_series(1,1000)n",[bulk.pid,bulk.oid]);
 assert.equal(await quantity(bulk),1000);
 const inventory=(await one('select supplier_backup_inventory($1) v',[bulk.pid])).v;
 assert.equal(inventory[0].uploadedQuantity,1000);
 console.log('Bulk 1,000-code fixture upload:',Date.now()-started,'ms');
 // Owned inventory behavior is retained.
 const owned={pid:id(9000),oid:id(9001)};
 await q("insert into products(id,name,stock_source) values($1,'Owned fixture','OWNED')",[owned.pid]);
 await q("insert into product_options(id,product_id,denomination) values($1,$2,10)",[owned.oid,owned.pid]);
 await upload(owned,2);
 assert.equal((await one('select stock_quantity from product_options where id=$1',[owned.oid])).stock_quantity,2);


 // Never guess a denomination/currency after product editing or for old jobs.
 const identity=await makeProduct(8500);await upload(identity,2);await stock(identity,4);
 const edited=await order(identity,8510);
 await q("update product_options set denomination_currency='EUR' where id=$1",[identity.oid]);
 await stock(identity,0);await pay(edited);assert.equal(await sold(edited),0);
 await q("update product_options set denomination_currency='USD' where id=$1",[identity.oid]);
 const historical=await order(identity,8520);
 await q('update definiteplay_jobs set backup_option_id=null,backup_currency=null where item_id=$1',[historical.item]);
 await pay(historical);assert.equal(await sold(historical),0);


 // Custom supplier ranges still snapshot the requested value and never use fixed codes.
 const rangeProduct=id(9600),rangeOption=id(9601);
 await q("insert into products(id,name,stock_source) values($1,'Range fixture','OWNED')",[rangeProduct]);
 await q("insert into product_options(id,product_id,is_custom_value,denomination,denomination_currency) values($1,$2,true,20,'USD')",[rangeOption,rangeProduct]);
 await q("insert into product_range_settings(product_id,option_id,enabled,supplier_reference,currency) values($1,$2,true,'RANGE-FIXTURE','USD')",[rangeProduct,rangeOption]);
 await q('insert into orders(id,total,subtotal) values($1,20,20)',[id(9602)]);
 await q("insert into order_items(id,order_id,product_id,product_option_id,quantity,denomination,custom_value,fulfillment_mode,total_price) values($1,$2,$3,$4,1,20,20,'RANGE_SUPPLIER',20)",[id(9603),id(9602),rangeProduct,rangeOption]);
 const rangeJob=await one('select * from definiteplay_jobs where item_id=$1',[id(9603)]);
 assert.equal(Number(rangeJob.card_value),20);assert.equal(rangeJob.card_currency,'USD');assert.equal(rangeJob.uploaded_backup_only,false);
 await pay({order:id(9602),item:id(9603),total:20});assert.equal(await sold({item:id(9603)}),0);

 // A verified but underpaid transaction must not release uploaded codes.
 const underpaidProduct=await makeProduct(9700);await upload(underpaidProduct,1);
 const underpaid=await order(underpaidProduct,9710);
 await q("update orders set status='PAID',paid_at=now() where id=$1",[underpaid.order]);
 await q("insert into payments(order_id,status,currency,amount) values($1,'VERIFIED','USD',$2)",[underpaid.order,underpaid.total-1]);
 await q('select fulfill_uploaded_supplier_backups(100)');assert.equal(await sold(underpaid),0);
 await q("update payments set amount=$2 where order_id=$1",[underpaid.order,underpaid.total]);
 assert.equal(await sold(underpaid),1,'verified full payment releases the matching code');


 // Mixed supplier / uploaded-only configurations preserve the actual option IDs and prices.
 for(const [ix,provider] of ['DEFINITEPLAY','WUPEX','FKWALLET'].entries()){
  const base=10000+ix*1000,pid=id(base),smallId=id(base+1),mediumId=id(base+2),linkedId=id(base+3),hiddenId=id(base+4);
  await q("insert into products(id,name,slug,category_id,region,currency,stock_source) values($1,'Mixed fixture',$2,$3,'Turkey','USD','OWNED')",[pid,'mixed-'+base,id(90001)]);
  for(const [oid,value,price,active] of [[smallId,10,0.26,true],[mediumId,50,1.30,true],[linkedId,100,2.60,true],[hiddenId,200,5.20,false]]){
   await q("insert into product_options(id,product_id,option_name,denomination,denomination_currency,selling_price,is_active,option_type) values($1,$2,$3,$4,'TRY',$5,$6,'CURRENCY')",[oid,pid,value+' TRY',value,price,active]);
   await q("insert into gift_card_codes(product_id,product_option_id,denomination,code,status) values($1,$2,$3,$4,'AVAILABLE')",[pid,oid,value,'MIXED-'+oid]);
  }
  const draft={markup:'10',exchangeRate:'1',kind:'CODE',customerFields:[],options:[{
   supplierKey:String(base),optionId:linkedId,name:'Apple 100 TRY',denomination:'100',currency:'TRY',supplierCost:'2',supplierCurrency:'USD',price:'2.20',
   supplierSnapshot:{id:base,sku:'MIXED'+base,name:'Apple 100 TRY',cardType:'voucher',subType:null,fields:[]}}]};
  const preview=async d=>({...d,uploadedOptions:(await one('select supplier_uploaded_options_to_keep($1,$2) v',[pid,JSON.stringify(d.options)])).v});
  const apply=async(n,d)=>q('select apply_product_supplier_configuration($1,$2,$3,$4,$5,$6,$7,$8)',[id(n),pid,id(90000),(await one('select product_supplier_version($1) v',[pid])).v,provider,connection,JSON.stringify(d),JSON.stringify({provider,category:'10',options:[]})]);
  let reviewed=await preview(draft);
  assert.deepEqual(reviewed.uploadedOptions.map(o=>o.optionId),[smallId,mediumId]);
  // Changes after the preview invalidate the entire transaction.
  await q("insert into gift_card_codes(product_id,product_option_id,denomination,code,status) values($1,$2,10,$3,'AVAILABLE')",[pid,smallId,'MIXED-EXTRA-'+base]);
  await assert.rejects(apply(base+5,reviewed),/Uploaded stock changed/);
  assert.equal((await one('select stock_source from products where id=$1',[pid])).stock_source,'OWNED');
  await assert.rejects(apply(base+5,{...reviewed,kind:'ACCOUNT'}),/valid fixed voucher/);
  reviewed=await preview(draft);
  // Reserved inventory cannot be reconfigured.
  await q("update gift_card_codes set status='RESERVED' where code=$1",['MIXED-EXTRA-'+base]);
  await assert.rejects(apply(base+5,reviewed),/Resolve reserved codes/);
  await q("update gift_card_codes set status='AVAILABLE' where code=$1",['MIXED-EXTRA-'+base]);
  await apply(base+5,reviewed);
  const flags=(await q('select option_id from product_uploaded_stock_options where product_id=$1 order by option_id',[pid])).rows;
  assert.deepEqual(flags.map(r=>r.option_id),[smallId,mediumId]);
  assert.equal((await one('select count(*)::int n from definiteplay_stock where product_id=$1',[pid])).n,1,'no fake supplier mappings');
  for(const [oid,price,count] of [[smallId,0.26,2],[mediumId,1.30,1]]){
   const option=await one('select * from product_options where id=$1',[oid]);
   assert.equal(Number(option.selling_price),price);assert.equal(option.is_active,true);assert.equal(option.stock_quantity,count);
   assert.equal(Number((await one('select confirmed_supplier_quantity($1) n',[oid])).n),0);
  }
  assert.equal((await one('select is_active from product_options where id=$1',[hiddenId])).is_active,false);
  assert.equal((await one('select count(*)::int n from gift_card_codes where product_option_id=$1 and status=\'AVAILABLE\'',[hiddenId])).n,1,'hidden inventory retained');
  const inventory=(await one('select supplier_backup_inventory($1) v',[pid])).v;
  assert.equal(inventory.find(o=>o.optionId===smallId).uploadedOnly,true);
  assert.equal(inventory.find(o=>o.optionId===linkedId).uploadedOnly,false);
  // Create a real paid order against the uploaded-only denomination, with the supplier offline.
  if(provider!=='DEFINITEPLAY')await q('update '+(provider==='WUPEX'?'wupex':'fkwallet')+"_worker_state set seen_at='epoch'");
  const local={pid,oid:smallId},o=await order(local,base+10,2);
  assert.equal((await job(o)).uploaded_backup_only,true);assert.equal(Number((await job(o)).max_unit_cost),0);
  assert.equal(await sold(o),0);
  await pay(o);assert.equal(await sold(o),2);await q('select deliver_uploaded_supplier_backup($1)',[o.item]);assert.equal(await sold(o),2);
  assert.equal((await job(o)).delivery_source,'UPLOADED_STOCK');assert.equal(await quantity(local),0);
  if(provider!=='DEFINITEPLAY'){
   assert.equal((await one('select count(*)::int n from '+(provider==='WUPEX'?'wupex':'fkwallet')+'_units where item_id=$1',[o.item])).n,0,'no external purchase units');
   await q('update '+(provider==='WUPEX'?'wupex':'fkwallet')+'_worker_state set seen_at=now()');
  }
  // Sync retains an exhausted uploaded option and its original price, then restocking makes it buyable.
  await apply(base+20,await preview(draft));
  assert.equal((await one('select is_active from product_options where id=$1',[smallId])).is_active,true);
  assert.equal(await quantity(local),0);await upload(local,1);assert.equal(await quantity(local),1);
  // Unfinished orders still block switching.
  const pending=await order(local,base+30);
  await assert.rejects(apply(base+40,await preview(draft)),/Resolve unfinished website orders/);
  await q("update orders set status='CANCELLED' where id=$1",[pending.order]);
  // A later real supplier mapping for 10 TRY reuses the existing option, clears its private flag,
  // and keeps its one uploaded code as supplier fallback.
  const expanded={...draft,options:[...draft.options,{...draft.options[0],supplierKey:String(base+99),optionId:smallId,name:'Apple 10 TRY',denomination:'10',supplierCost:'0.2',price:'0.22',supplierSnapshot:{...draft.options[0].supplierSnapshot,id:base+99,sku:'TEN'+base}}]};
  await apply(base+40,await preview(expanded));
  assert.equal((await one('select count(*)::int n from product_uploaded_stock_options where option_id=$1',[smallId])).n,0);
  assert.equal((await one('select count(*)::int n from definiteplay_stock where option_id=$1',[smallId])).n,1);
  assert.equal(await quantity(local),1);
  assert.equal((await one('select is_active from product_options where id=$1',[mediumId])).is_active,true);
 }
 console.log('PASS: mixed uploaded-only / supplier denominations across all providers, stock-sensitive preview, reserve guards, exhausted-option retention, restock and later remapping');
 // Permission boundaries.
 for(const role of ['anon','authenticated']){
  await db.exec('set role '+role);
  await reject('select supplier_backup_inventory($1)',[p.pid]);
  await reject('select * from product_uploaded_stock_options');
  await reject('select supplier_uploaded_options_to_keep($1,$2)',[p.pid,'[]']);
  await reject('select deliver_uploaded_supplier_backup($1)',[protectedOrders[0].item]);
  await reject('select fulfill_uploaded_supplier_backups(100)');
  await db.exec('reset role');
 }
 await db.close();
 console.log('PASS: supplier-first and uploaded fallback for all three suppliers; verified payment; exact denomination; zero/stale stock; restock; full-batch allocation; idempotence; competing orders; supplier/refund/lease protection; account exclusion; permissions; repeatable migration');
})().catch(e=>{console.error(e.stack,e.detail??'',e.where??'');process.exit(1)});
