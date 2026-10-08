/* eslint-disable @typescript-eslint/no-require-imports -- Matches the repository's standalone Node test runner. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../..');
function load(file) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('exports', 'require', js)(exports, name => name === './catalog-import' ? api : require(name));
  return exports;
}
const api = load('lib/catalog-import.ts');
const { buildCatalogPlan } = load('lib/catalog-import-plan.ts');
const settings = api.DEFAULT_CATALOG_SETTINGS;
assert.equal(api.calculateCatalogPrice('2999', settings), '36.72');
assert.equal(api.calculateCatalogPrice('0.49', { markup_percent: '0', inr_per_usd: '98' }), '0.01');
assert.throws(() => api.calculateCatalogPrice('3e3', settings));
assert.throws(() => api.calculateCatalogPrice('2999', { markup_percent: '20', inr_per_usd: '0' }));
const category = { id: '11111111-1111-4111-8111-111111111111', name: 'PlayStation', slug: 'playstation', category_type: 'GAME' };
const user = '22222222-2222-4222-8222-222222222222';
const columns = ['parent_sku','sku','title_en','title_ru','slug','description_en','description_ru','option_name','platform','store_price_inr','store_url','price_checked_at','availability','customer_fields','is_featured','affiliate_enabled','affiliate_commission_percent','delivery_instructions'];
const row = ['PS-IN-TEST','PS-IN-TEST-STANDARD','Test game','Тестовая игра 🎮','test-game','Keep this manually edited description','Русское описание 🎮','Standard Edition','PS5','2999','https://store.playstation.com/en-in/concept/10002456',new Date().toISOString(),'AVAILABLE','PSN_EMAIL_AND_ID','true','true','3','We complete your order manually.'];
const csv = api.catalogCsv(columns,[row,[...row.slice(0,1),'PS-IN-TEST-DELUXE',...row.slice(2,7),'Deluxe Edition',...row.slice(8)]]);
const mapping = api.defaultColumnMapping(columns);
const prepared = buildCatalogPlan(csv,mapping,settings,[category],category.id,{},{});
assert.equal(prepared.plan.length,1); assert.equal(prepared.plan[0].editions.length,2); assert.equal(prepared.errors.length,0);
assert.equal(prepared.plan[0].product.description_ru,'Русское описание 🎮');
assert.equal(prepared.plan[0].product.affiliate_commission_percent,'3');
const invalidCommission=[...row];invalidCommission[16]='26';
assert.match(api.parseCatalogImport(api.catalogCsv(columns,[invalidCommission]),mapping,settings).errors[0].error,/between 0% and 25%/);
const missingCommission=[...row];missingCommission[16]='';
assert.match(buildCatalogPlan(api.catalogCsv(columns,[missingCommission]),mapping,settings,[category],category.id,{},{}).errors[0].error,/commission greater than 0%/);
assert.equal(api.parseCatalogImport(api.catalogCsv(columns,[row,row]),mapping,settings).errors.length,2);
assert.throws(() => api.readCatalogCsv('a,b\n"unclosed'));
assert.equal(api.parseCatalogImport(api.catalogCsv(columns,[[...row.slice(0,8),'PC',...row.slice(9)]]),mapping,settings).errors.length,1);
assert.equal(api.isOfficialStoreUrl('https://store.playstation.com.evil.test/en-in/concept/1'),false);
assert.match(api.catalogCsv(['error'],[['=HYPERLINK("evil")']]), /'=HYPERLINK/);

(async () => {
  const db = new PGlite();
  const initial = fs.readFileSync(path.join(root,'supabase/migrations/00000000_initial_schema.sql'),'utf8');
  await db.exec("create schema auth; create table auth.users(id uuid primary key); create role anon; create role authenticated; create role service_role; create type public.delivery_type as enum('AUTO','MANUAL'); create type public.product_status as enum('DRAFT','ACTIVE','INACTIVE');");
  for (const table of ['categories','products','product_options']) await db.exec(initial.match(new RegExp(`create table if not exists public.${table} \\([\\s\\S]*?\\n\\);`))[0]);
  await db.exec("alter table products add column is_bulk_order boolean not null default false, add column affiliate_enabled boolean not null default false, add column affiliate_commission_percent numeric(5,2) not null default 0, add column affiliate_updated_at timestamptz; alter table product_options alter column denomination type numeric(14,4);");
  await db.exec("alter table products add column name_ru text, add column description_ru text, add column gaming_platforms text[] default '{}'; alter table product_options add column is_in_stock boolean default true; create table product_customer_fields(id uuid primary key default gen_random_uuid(),product_id uuid references products(id) on delete cascade,label text,placeholder text,field_type text,is_required boolean,sort_order int,created_at timestamptz default now(),updated_at timestamptz default now()); create table order_items(id uuid primary key default gen_random_uuid(),product_id uuid references products(id),product_option_id uuid references product_options(id));");
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20260801_150000_sync_product_price_from_options.sql'),'utf8').split('update public.products as product')[0]);
  await db.query('insert into auth.users values($1)',[user]);
  await db.query('insert into categories(id,name,slug,category_type) values($1,$2,$3,$4)',[category.id,category.name,category.slug,category.category_type]);
  await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20261008_140000_playstation_catalog_import.sql'),'utf8'));
  const run = async plan => (await db.query("insert into product_import_runs(created_by,created_by_email,filename,settings,plan) values($1,'admin@test.invalid','test.csv',$2,$3) returning id",[user,settings,plan])).rows[0].id;
  const apply = async (r,i=0) => (await db.query('select apply_catalog_import_item($1,$2) as result',[r,i])).rows[0].result;
  const undo = async r => (await db.query('select undo_catalog_import_item($1,0) as result',[r])).rows[0].result;
  const snapshot = async () => (await db.query('select snapshot from catalog_import_snapshots($1)',[['PS-IN-TEST']])).rows[0].snapshot;
  const count = async () => (await db.query('select count(*)::int as n from products')).rows[0].n;
  // Pure preview must leave the database untouched.
  assert.equal(await count(),0); buildCatalogPlan(csv,mapping,settings,[category],category.id,{},{}); assert.equal(await count(),0);
  const first=await run(prepared.plan), created=await apply(first); assert.equal(created.status,'CREATED',created.message);
  assert.equal((await apply(first)).productId,created.productId); assert.equal(await count(),1);
  let old=await snapshot(); assert.equal(old.product.status,'DRAFT'); assert.deepEqual(old.product.gaming_platforms,['PS5']); assert.equal(old.options.length,2); assert.equal(old.fields.length,2); assert(old.fields.every(f=>f.is_required));
  assert.equal(old.fields.find(f=>f.label==='PlayStation account email').field_type,'EMAIL');
  assert.equal(old.product.description_ru,'Русское описание 🎮');
  assert.equal(old.product.is_featured,true);assert.equal(old.product.affiliate_enabled,true);assert.equal(Number(old.product.affiliate_commission_percent),3);
  assert.equal(old.product.delivery_type,'MANUAL');assert.equal(old.product.is_bulk_order,false);assert.equal(old.product.stock_quantity,2147483647);
  assert.equal(Number(old.options[0].denomination),2999);assert.equal(old.options[0].denomination_currency,'INR');
  // Editing copy must not re-enable an edition manually marked out of stock.
  const manualStock=JSON.parse(JSON.stringify(old));
  manualStock.options.forEach(o=>o.is_in_stock=false);
  const copyColumns=['parent_sku','sku','title_en'];
  const copyOnly=buildCatalogPlan(api.catalogCsv(copyColumns,[['PS-IN-TEST','PS-IN-TEST-STANDARD','Edited title']]),api.defaultColumnMapping(copyColumns),settings,[category],'',{'PS-IN-TEST':manualStock},{});
  assert.equal(copyOnly.plan[0].editions[0].is_in_stock,false);
  assert.equal(Number(copyOnly.plan[0].editions[0].price),36.72);
  const smallColumns=['parent_sku','sku','store_price_inr','store_url','price_checked_at','availability'];
  const small=api.catalogCsv(smallColumns,[['PS-IN-TEST','PS-IN-TEST-STANDARD','3999',row[10],row[11],'AVAILABLE']]);
  const refresh=buildCatalogPlan(small,api.defaultColumnMapping(smallColumns),settings,[category],'',{'PS-IN-TEST':old},{'PS-IN-TEST-STANDARD':old.product.id});
  assert.deepEqual(refresh.plan[0].product,{});
  const second=await run(refresh.plan); assert.equal((await apply(second)).status,'UPDATED');
  let updated=await snapshot(); assert.equal(updated.product.description,old.product.description); assert.equal(updated.options.length,2);
  assert.equal(updated.product.affiliate_enabled,true);assert.equal(Number(updated.product.affiliate_commission_percent),3);assert.equal(updated.product.is_featured,true);
  assert.equal(Number(updated.options.find(o=>o.catalog_sku==='PS-IN-TEST-STANDARD').denomination),3999);
  assert.equal(Number(updated.options.find(o=>o.catalog_sku==='PS-IN-TEST-STANDARD').selling_price),48.97);
  assert.equal((await undo(second)).status,'UNDONE'); updated=await snapshot(); assert.equal(updated.product.description,old.product.description); assert.equal(Number(updated.options.find(o=>o.catalog_sku==='PS-IN-TEST-STANDARD').selling_price),36.72);
  assert.equal(Number(updated.options.find(o=>o.catalog_sku==='PS-IN-TEST-STANDARD').denomination),2999);
  const settingColumns=['parent_sku','sku','is_featured','affiliate_enabled','affiliate_commission_percent'];
  const settingCsv=api.catalogCsv(settingColumns,[['PS-IN-TEST','PS-IN-TEST-STANDARD','false','false','0']]);
  const settingPlan=buildCatalogPlan(settingCsv,api.defaultColumnMapping(settingColumns),settings,[category],'',{'PS-IN-TEST':updated},{});
  const settingRun=await run(settingPlan.plan);assert.equal((await apply(settingRun)).status,'UPDATED');
  assert.equal((await snapshot()).product.affiliate_enabled,false);assert.equal((await snapshot()).product.is_featured,false);
  assert.equal((await undo(settingRun)).status,'UNDONE');updated=await snapshot();assert.equal(updated.product.affiliate_enabled,true);assert.equal(updated.product.is_featured,true);assert.equal(Number(updated.product.affiliate_commission_percent),3);
  // Reimporting creates no additional products or editions.
  const repeated=buildCatalogPlan(csv,mapping,settings,[category],category.id,{'PS-IN-TEST':updated},{});
  assert.equal((await apply(await run(repeated.plan))).status,'UPDATED'); assert.equal(await count(),1); assert.equal((await snapshot()).options.length,2);
  // Undo cannot erase later manual edits.
  await db.query("update products set description='A later manual edit' where id=$1",[created.productId]);
  assert.equal((await undo(first)).status,'PROTECTED'); assert.equal(await count(),1);
  // Stale previews are rejected atomically.
  assert.equal((await apply(await run(refresh.plan))).status,'REJECTED');
  // Missing/expired verification rejects orders even through direct SQL/API entry points.
  old=await snapshot(); const option=old.options[0];
  await db.query("update product_options set catalog_source=catalog_source || '{\"sale_ends_at\":\"2000-01-01T00:00:00Z\"}'::jsonb where id=$1",[option.id]);
  await assert.rejects(db.query('insert into order_items(product_id,product_option_id) values($1,$2)',[created.productId,option.id]),/sale has expired/);
  await db.query("update product_options set catalog_source=catalog_source || '{\"availability\":\"UNVERIFIED\"}'::jsonb where id=$1",[option.id]);
  await assert.rejects(db.query('insert into order_items(product_id,product_option_id) values($1,$2)',[created.productId,option.id]),/verified PlayStation/);
  // Service-only RPC and audit data.
  assert.equal((await db.query("select has_function_privilege('authenticated','apply_catalog_import_item(uuid,integer)','EXECUTE') as allowed")).rows[0].allowed,false);
  assert.equal((await db.query("select has_table_privilege('anon','product_import_runs','SELECT') as allowed")).rows[0].allowed,false);
  // Removing an unchanged newly imported draft is safe and repeatable.
  const newPlan=JSON.parse(JSON.stringify(prepared.plan)); newPlan[0].parent_sku='PS-IN-UNDO'; newPlan[0].product.slug='undo-game'; newPlan[0].editions.forEach((e,i)=>e.sku=`PS-IN-UNDO-${i}`);
  const removable=await run(newPlan); assert.equal((await apply(removable)).status,'CREATED'); assert.equal((await undo(removable)).status,'UNDONE'); assert.equal((await undo(removable)).status,'UNDONE'); assert.equal(await count(),1);
  await db.close();
  console.log('PASS: money, Unicode, editions, validation, dry run, idempotence, partial updates, rollback protection, expiry guard, and permissions.');
})().catch(e=>{console.error(e.stack);process.exit(1);});
