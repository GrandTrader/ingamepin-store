// Isolated database tests use the existing real checkout, range and wallet fixtures.
const fs = require('node:fs'), assert = require('node:assert/strict');
const { PGlite } = require('@electric-sql/pglite');
(async () => {
 const db = new PGlite();
 try {
  const source = fs.readFileSync('scripts/tests/portal-wallet-db.cjs', 'utf8');
  const start = source.indexOf(' const fixture=');
  const end = source.indexOf(' const before=await counts();const quote=');
  assert(start > 0 && end > start, 'Checkout fixture setup boundary');
  const setup = source.slice(start, end);
  const run = new (Object.getPrototypeOf(async function(){}).constructor)('db','fs','assert','version', setup + String.raw`
   {
   const promotionMigration = fs.readFileSync('supabase/migrations/20261009_010000_expiring_product_discounts.sql','utf8');
   const baseline = await counts();
   await db.exec(promotionMigration); await db.exec(promotionMigration);
   assert.deepEqual(await counts(),baseline,'Installing and reinstalling never creates orders or debits');
   const one=async(sql,args=[]) => (await db.query(sql,args)).rows[0];
   const future = new Date(Date.now()+86400000).toISOString(), past = new Date(Date.now()-86400000).toISOString();
   let revision=null;
   const save=async(rules, expected=revision, user=buyer)=>{
    const result=await one('select save_product_promotions($1,$2,$3,$4) revision',[product,user,expected,JSON.stringify(rules)]);
    revision=result.revision; return revision;
   };
   const rule=(optionId,percent,endsAt=future)=>({optionId,percent,endsAt});
   const promo=async(opt=option)=>Number((await one('select product_promotion_percent($1,$2) pct',[product,opt])).pct);
   assert.equal(await promo(),0);
   await assert.rejects(save([rule(null,20)],null,other),/Administrator/);
   await assert.rejects(save([rule(id(999),20)]),/does not belong/);
   await assert.rejects(save([rule(null,100)]),/99.99/);
   await assert.rejects(save([rule(null,1.234)]),/Invalid discount/);
   await assert.rejects(save([rule(null,20,null)]),/expiry/);
   await assert.rejects(save([rule(null,20),rule(null,30)]),/Duplicate/);
   await save([rule(null,20)]);
   assert.equal(await promo(),20);
   await assert.rejects(save([],null),/settings changed/);
   assert.equal(await promo(),20,'Concurrent stale save cannot remove promotion');
   await db.query('insert into seller_product_submissions values($1)',[product]);
   await assert.rejects(save([rule(null,15)]),/Seller-managed listings/);
   await db.query('delete from seller_product_submissions where product_id=$1',[product]);
   const sold=await call('quote');
   assert.equal(Number(sold.subtotal),17.28);
   assert.equal(Number(sold.discount),0,'Larger sale suppresses smaller personal discount');
   assert.equal(Number(sold.total),18.28);
   assert.equal(Number(sold.items[0].lineTotal),17.28);
   assert.deepEqual(await counts(),baseline,'Quote leaves no order, stock hold or wallet debit');
   await db.query('update customer_product_discounts set discount_percent=30');
   const personal=await call('quote');
   assert.equal(Number(personal.total),16.12,'30% personal discount wins over 20% sale; not stacked');
   assert.equal(Number(personal.items[0].unitPrice),7.56);
   assert.equal(Number(personal.items[0].lineTotal),15.12);
   await db.query('update customer_product_discounts set discount_percent=10');
   await save([rule(null,20),rule(option,0,null)]); assert.equal(await promo(),0);
   assert.equal(Number((await call('quote')).total),20.44,'Explicit no-sale denomination overrides whole-product sale');
   await save([rule(null,20),rule(option,40,past)]); assert.equal(await promo(),0,'Expired override never falls back to product sale');
   await save([rule(null,20),rule(option,40)]); assert.equal(await promo(),40);
   const quote40=await call('quote'); assert.equal(Number(quote40.total),13.96);
   await save([rule(null,20),rule(option,40,past)]);
   await assert.rejects(call('confirm',44,quote40.total),/price changed/);
   assert.deepEqual(await counts(),baseline,'Expired confirmation is atomic and cannot debit');
   await save([rule(null,20)]);
   const retail=async(expected)=> db.query("select create_business_checked_order('Buyer','buyer@example.com','','wallet',$1,null,$2) result",[JSON.stringify([{productOptionId:option,quantity:2,customValue:1000,expectedSaleUnitPrice:expected}]),buyer]);
   await assert.rejects(retail(1),/price or discount changed/);
   assert.deepEqual(await counts(),baseline);
   const paid=await call('confirm',45,18.28);
   assert.equal(Number((await one('select promotion_percent from order_items where order_id=$1',[paid.orderId])).promotion_percent),20);
   assert.equal(Number((await counts()).balance),81.72);
   const after=await counts();
   await save([rule(null,20,past)]);
   assert.equal((await call('confirm',45,18.28)).orderId,paid.orderId,'Paid-order replay preserves locked price after expiry');
   assert.deepEqual(await counts(),after);
   await save([rule(null,20)]);
   await db.query('update product_range_settings set price_usd=2 where product_id=$1',[product]);
   assert.equal(Number((await call('quote')).total),33,'A changed base price keeps the percentage discount');
   await db.query("insert into gift_card_codes(product_id,product_option_id,code,status,denomination) values($1,$2,'PROMO-CODE-A','AVAILABLE',10),($1,$2,'PROMO-CODE-B','AVAILABLE',10)",[product,id(2)]);
   const fixed=[{productOptionId:id(2),quantity:2}];
   assert.equal(Number((await call('quote',46,null,fixed)).total),17,'Fixed denominations receive product sale');
   await save([rule(null,20),rule(id(2),35)]);
   assert.equal(Number((await call('quote',46,null,fixed)).total),14,'Per-denomination sale wins');
   assert.equal(Number((await one('select selling_price from product_options where id=$1',[id(2)])).selling_price),10,'Normal price is preserved');
   for(const role of ['anon','authenticated']) {
    assert.equal((await one('select has_table_privilege($1,\'product_promotions\',\'INSERT\') allowed',[role])).allowed,false);
    assert.equal((await one('select has_function_privilege($1,\'save_product_promotions(uuid,uuid,uuid,jsonb)\',\'execute\') allowed',[role])).allowed,false);
   }
   const definition=(await one("select pg_get_functiondef('create_store_order(text,text,text,text,jsonb,text)'::regprocedure) src")).src;
   assert.equal(definition.split('v_unit_price := public.promotion_unit_price').length,2,'Repeated promotionMigration patches checkout only once');
   const changed=definition.replace('v_fulfillment_mode :=', 'v_fulfillment_mode:=').replaceAll('public.promotion_unit_price','public.unrecognized_price');
   await db.exec(changed);
   await assert.rejects(db.exec(promotionMigration),/Unrecognised checkout/);
   await db.exec('rollback');
   assert.equal((await one("select pg_get_functiondef('create_store_order(text,text,text,text,jsonb,text)'::regprocedure) src")).src,changed,'Unknown checkout definitions fail without replacement');
   console.log('PASS: fixed/range discounts, India expiry data, override/off/expiry, best customer discount, current base prices, stale quote rejection, atomic rollback, paid replay, administrator access, revision protection and idempotent migration.');
   }
  `);
  await run(db,fs,assert,'seller');
 } finally { await db.close(); }
})().catch(e=>{console.error(e);process.exitCode=1;});
