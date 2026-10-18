const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const migration = fs.readFileSync('supabase/migrations/20261018_160000_manual_delivery_batches.sql','utf8');
const id = n => '00000000-0000-4000-8000-'+String(n).padStart(12,'0');
(async()=>{
 const db=new PGlite();
 const rows=async(sql,p=[]) => (await db.query(sql,p)).rows;
 const scalar=async(sql,p=[]) => Object.values((await rows(sql,p))[0])[0];
 await db.exec(`
 create role anon; create role authenticated; create role service_role;
 create table admin_users(user_id uuid primary key);
 create table orders(id uuid primary key,status text,delivered_at timestamptz,updated_at timestamptz);
 create table products(id uuid primary key,delivery_type text,is_bulk_order boolean,stock_quantity integer,updated_at timestamptz);
 create table product_options(id uuid primary key,product_id uuid,stock_quantity integer,updated_at timestamptz);
 create table order_items(id uuid primary key,order_id uuid,product_id uuid,product_option_id uuid,denomination numeric,quantity integer,fulfillment_mode text,service_delivered_at timestamptz);
 create table order_item_refunds(order_item_id uuid,quantity integer,status text);
 create table order_refund_requests(order_id uuid,status text);
 create table gift_card_codes(id uuid primary key default gen_random_uuid(),product_id uuid,product_option_id uuid,order_item_id uuid,denomination numeric,code text unique,status text,reserved_at timestamptz,sold_at timestamptz,updated_at timestamptz,created_at timestamptz default now(),created_by uuid);
 create function complete_manual_order(p_order_id uuid,p_admin_user_id uuid,p_deliveries jsonb) returns jsonb language plpgsql as $$ begin return '{}'; end; $$;
 insert into admin_users values('${id(1)}');
 insert into orders values('${id(2)}','PROCESSING',null,null),('${id(3)}','PENDING',null,null),('${id(10)}','DELIVERED',now(),null);
 insert into products values('${id(4)}','MANUAL',true,1,null),('${id(40)}','AUTOMATIC',false,0,null);
 insert into product_options values('${id(5)}','${id(4)}',1,null);
 insert into order_items values('${id(7)}','${id(2)}','${id(4)}','${id(5)}',100,300,null,null),('${id(8)}','${id(3)}','${id(4)}','${id(5)}',100,10,null,null),('${id(9)}','${id(2)}','${id(4)}',null,200,2,null,null),('${id(41)}','${id(2)}','${id(40)}',null,1,1,null,null),('${id(11)}','${id(10)}','${id(4)}',null,100,1,null,null);
 insert into gift_card_codes(product_id,product_option_id,code,status) values('${id(4)}','${id(5)}','stocked','AVAILABLE');
 insert into gift_card_codes(product_id,order_item_id,code,status,sold_at) values('${id(4)}','${id(9)}','legacy1','SOLD','2020-01-01'),('${id(4)}','${id(9)}','legacy2','SOLD','2020-01-02'),('${id(4)}','${id(11)}','held-legacy','SOLD','2020-01-03');
 insert into order_refund_requests values('${id(10)}','REQUESTED');
 `);
 await db.exec(fs.readFileSync('supabase/migrations/20260918_234000_sync_code_inventory.sql','utf8'));
 await db.exec(fs.readFileSync('supabase/migrations/20261003_150000_partial_manual_code_delivery.sql','utf8'));
 await db.exec('alter table order_items add column created_at timestamptz default now(), add column product_name text;');
 await db.exec(fs.readFileSync('supabase/migrations/20260723_require_manual_fulfillment.sql','utf8'));

 // Use the installed supplier and refund guards, not permissive test stubs.
 await db.exec("alter table products add column stock_source text not null default 'OWNED'; create table definiteplay_jobs(item_id uuid primary key,provider text,order_id uuid,state text);");
 for(const [offset,provider] of [[50,'DEFINITEPLAY'],[60,'GIFTPORT'],[70,'FKWALLET']]) {
  await db.query("insert into orders(id,status) values($1,'DELIVERED')",[id(offset)]);
  await db.query("insert into order_items(id,order_id,product_id,quantity,fulfillment_mode) values($1,$2,$3,2,$4)",[id(offset+1),id(offset),id(4),provider==='DEFINITEPLAY'?'RANGE_SUPPLIER':null]);
  await db.query("insert into definiteplay_jobs values($1,$2,$3,'DELIVERED')",[id(offset+1),provider,id(offset)]);
  await db.query("insert into gift_card_codes(product_id,order_item_id,code,status,sold_at) values($1,$2,$3,'SOLD','2020-02-01')",[id(4),id(offset+1),'old-'+provider]);
 }
 const supplierSql=fs.readFileSync('supabase/migrations/20260925_150000_definiteplay_fulfillment.sql','utf8');
 const supplierGuard=supplierSql.slice(supplierSql.indexOf('create function public.guard_definiteplay_codes()'),supplierSql.indexOf('create function public.guard_definiteplay_product()'));
 assert.match(supplierGuard,/Supplier codes are managed by supplier fulfilment/);
 await db.exec(supplierGuard.replaceAll("stock_source='DEFINITEPLAY'","stock_source in ('DEFINITEPLAY','GIFTPORT','FKWALLET')"));
 const refundSql=fs.readFileSync('supabase/migrations/20260927_180000_customer_order_refunds.sql','utf8');
 const refundGuard=refundSql.slice(refundSql.indexOf('create function public.guard_customer_refund_hold()'),refundSql.indexOf('create trigger customer_refund_order_guard'));
 await db.exec(refundGuard+"create trigger customer_refund_code_guard before insert or update or delete on gift_card_codes for each row execute function guard_customer_refund_hold();");
 await db.exec(migration);
 assert.equal(await scalar('select count(*)::integer from manual_delivery_batches where legacy'),2);

 // Supplier history is untouched even if a product has switched back to owned/manual stock.
 assert.equal(await scalar("select count(*)::integer from gift_card_codes where code like 'old-%' and manual_delivery_batch_id is not null"),0);
 assert.equal(await scalar("select count(*)::integer from gift_card_codes where code like 'old-%' and status='SOLD'"),3);
 for(const [offset,provider] of [[50,'DEFINITEPLAY'],[60,'GIFTPORT'],[70,'FKWALLET']]) {
  await assert.rejects(db.query("update gift_card_codes set updated_at=now() where code=$1",['old-'+provider]),/Supplier codes are managed/);
  // The normal supplier completion context still delivers without creating manual batches.
  await db.transaction(async tx=>{
   await tx.query("select set_config('app.definiteplay_delivery',$1,true)",[id(offset+1)]);
   await tx.query("insert into gift_card_codes(product_id,order_item_id,code,status,sold_at,created_by) values($1,$2,$3,'SOLD',now(),$4)",[id(4),id(offset+1),'new-'+provider,id(1)]);
  });
  assert.equal(await scalar('select manual_delivery_batch_id from gift_card_codes where code=$1',['new-'+provider]),null);
 }
 await assert.rejects(db.query("update gift_card_codes set updated_at=now() where code='held-legacy'"),/Delivery is paused/);
 const send=async(codes,item=7)=>scalar('select deliver_manual_codes_batch($1,$2,$3,$4)',[id(2),id(item),id(1),codes]);
 const revoke=async(batch,order=2,admin=1,reason='Invalid supplier codes')=>scalar('select revoke_manual_delivery_batch($1,$2,$3,$4)',[id(order),batch,id(admin),reason]);
 const batches=Array.from({length:3},(_,b)=>Array.from({length:100},(_,i)=>b===0&&i===0?'stocked':`test-${b}-${i}`));
 for(let b=0;b<3;b++){const r=await send(batches[b]);assert.equal(r.codes.length,100);assert.equal(r.remaining,200-b*100);}
 let batchRows=await rows('select * from manual_delivery_batches where order_item_id=$1 order by sent_at,id',[id(7)]);
 assert.equal(batchRows.length,3);assert.ok(batchRows.every(b=>b.code_count===100&&b.sent_by===id(1)));
 const middle=await scalar("select manual_delivery_batch_id from gift_card_codes where code='test-1-0'");
 assert.equal((await send(batches[1])).skipped,100);
 assert.equal(await scalar('select count(*)::integer from manual_delivery_batches where order_item_id=$1',[id(7)]),3);
 await assert.rejects(revoke(middle,2,99),/Administrator/);
 await assert.rejects(revoke(middle,3),/not found for this order/);
 await assert.rejects(revoke(middle,2,1,'x'),/reason/);
 await assert.rejects(revoke(middle,2,1,null),/reason/);
 // Even a previously linked manual batch cannot bypass later supplier ownership.
 await db.query("insert into definiteplay_jobs values($1,'DEFINITEPLAY',$2,'DELIVERED')",[id(7),id(2)]);
 await assert.rejects(revoke(middle),/Supplier deliveries cannot be revoked as manual batches/);
 await db.query('delete from definiteplay_jobs where item_id=$1',[id(7)]);
 await db.query('insert into order_refund_requests values($1,$2)',[id(2),'REQUESTED']);
 await assert.rejects(revoke(middle),/refund request/);
 await db.query('delete from order_refund_requests where order_id=$1',[id(2)]);
 await db.query("update orders set status='DELIVERED',delivered_at=now() where id=$1",[id(2)]);
 // Simulate a database failure during withdrawal: audit and codes must roll back together.
 await db.exec(`create function fail_test_revoke() returns trigger language plpgsql as $$ begin if NEW.status='DISABLED' and NEW.code='test-1-55' then raise exception 'Simulated failure'; end if; return NEW; end; $$; create trigger zz_fail_test before update on gift_card_codes for each row execute function fail_test_revoke();`);
 await assert.rejects(revoke(middle),/Simulated failure/);
 assert.equal(await scalar('select revoked_at from manual_delivery_batches where id=$1',[middle]),null);
 assert.equal(await scalar("select count(*)::integer from gift_card_codes where manual_delivery_batch_id=$1 and status='SOLD'",[middle]),100);
 await db.exec('drop trigger zz_fail_test on gift_card_codes;');
 const revoked=await revoke(middle);assert.equal(revoked.revoked,100);assert.equal(revoked.remaining,100);
 assert.equal(await scalar("select count(*)::integer from gift_card_codes where order_item_id=$1 and status='SOLD'",[id(7)]),200);
 assert.equal(await scalar("select count(*)::integer from gift_card_codes where manual_delivery_batch_id=$1 and status='DISABLED'",[middle]),100);
 assert.deepEqual(await rows('select status,delivered_at from orders where id=$1',[id(2)]),[{status:'PROCESSING',delivered_at:null}]);
 assert.equal((await revoke(middle)).alreadyRevoked,true);
 await assert.rejects(db.query("update orders set status='DELIVERED' where id=$1",[id(2)]),/Replace or refund/);
 await assert.rejects(send(['test-1-0']),/unavailable/);
 await assert.rejects(db.query("update gift_card_codes set status='AVAILABLE' where code='test-1-0'"),/cannot be reused/);
 await assert.rejects(db.query("update gift_card_codes set code='rewritten' where code='test-1-0'"),/history cannot be changed/);
 await assert.rejects(db.query("delete from gift_card_codes where code='test-1-0'"),/history cannot be deleted/);
 assert.equal(await scalar('select stock_quantity from product_options where id=$1',[id(5)]),0);
 const replacement=Array.from({length:100},(_,i)=>'replacement-'+i);
 assert.equal((await send(replacement)).remaining,0);
 assert.equal(await scalar('select count(*)::integer from manual_delivery_batches where order_item_id=$1',[id(7)]),4);
 await db.query("update orders set status='DELIVERED',delivered_at=now() where id=$1",[id(2)]);
 const replacementBatch=await scalar("select manual_delivery_batch_id from gift_card_codes where code='replacement-0'");
 assert.equal((await revoke(replacementBatch)).remaining,100);
 await db.query("insert into order_item_refunds values($1,100,'COMPLETED')",[id(7)]);
 await assert.rejects(send(['too-many']),/Only 0/);
 await db.query("update orders set status='DELIVERED' where id=$1",[id(2)]);
 await db.query("insert into gift_card_codes(product_id,order_item_id,code,status,sold_at) values($1,$2,'auto-code','SOLD',now())",[id(40),id(41)]);
 assert.equal(await scalar("select manual_delivery_batch_id from gift_card_codes where code='auto-code'"),null);
 // Range-manual items on instant products are tracked; account activations are excluded.
 await db.query("update orders set status='PROCESSING' where id=$1",[id(2)]);
 await db.query("insert into order_items(id,order_id,product_id,quantity,fulfillment_mode) values($1,$2,$3,2,'RANGE_MANUAL'),($4,$2,$3,1,'PLAYER_ID_TOPUP')",[id(42),id(2),id(40),id(43)]);
 await send(['range-one','range-two'],42);
 assert.equal(await scalar('select code_count from manual_delivery_batches where order_item_id=$1',[id(42)]),2);
 await assert.rejects(send(['account-code'],43),/cannot be sent/);
 // Legacy completion still creates a batch with the verified sender.
 await db.query("update orders set status='PROCESSING' where id=$1",[id(3)]);
 await db.query('update order_items set quantity=2 where id=$1',[id(8)]);
 await scalar('select complete_manual_order($1,$2,$3::jsonb)',[id(3),id(1),JSON.stringify([{orderItemId:id(8),codes:['older-flow-one','older-flow-two']}])]);
 assert.deepEqual(await rows('select code_count,sent_by from manual_delivery_batches where order_item_id=$1',[id(8)]),[{code_count:2,sent_by:id(1)}]);
 // Older deliveries under a resolved refund hold can be safely included on a repeat run.
 await db.query("update order_refund_requests set status='CANCELLED' where order_id=$1",[id(10)]);
 const before=await scalar('select count(*)::integer from manual_delivery_batches');
 await db.exec(migration);assert.equal(await scalar('select count(*)::integer from manual_delivery_batches'),before+1);
 await db.exec(migration);assert.equal(await scalar('select count(*)::integer from manual_delivery_batches'),before+1);
 await db.exec('set role authenticated;');
 await assert.rejects(db.query('select * from manual_delivery_batches'),/permission denied/);
 await assert.rejects(revoke(middle),/permission denied/);
 await db.exec('reset role; set role service_role;');
 await assert.rejects(db.query("update manual_delivery_batches set revoke_reason='changed'"),/permission denied/);
 await db.exec('reset role;');
 await db.close();console.log('PASS: separate 100-code sends, historical batches, idempotency, scoped revocation, atomic rollback, replacements, repeat revocation, refunds, stock safety, audit protection, permissions and real supplier/refund guard compatibility');
})().catch(e=>{console.error(e);process.exit(1)});
