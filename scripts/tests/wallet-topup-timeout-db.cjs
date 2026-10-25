const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12,'0');
(async () => {
 const db = new PGlite();
 try {
  await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); create table public.orders(id uuid primary key); grant usage on schema public to anon,authenticated,service_role;");
  const schema = fs.readFileSync('supabase/migrations/00000000_initial_schema.sql','utf8');
  for (const table of ['customer_wallets','wallet_transactions','wallet_topup_requests']) {
   const start = schema.indexOf('create table if not exists public.'+table+' (');
   await db.exec(schema.slice(start,schema.indexOf('\n);',start)+4));
  }
  await db.query('insert into auth.users values($1),($2)',[id(1),id(2)]);
  await db.query('insert into customer_wallets(user_id,balance) values($1,100),($2,200)',[id(1),id(2)]);
  const add = async (n,age=31,status='PENDING',user=1,method='PALLY') =>
   db.query("insert into wallet_topup_requests(id,user_id,amount,payment_method,status,gateway_order_id,created_at) values($1,$2,25,$3,$4,$5,now()-($6||' minutes')::interval)",[id(n),id(user),method,status,'gateway-'+n,String(age)]);
  const row = async n => (await db.query('select * from wallet_topup_requests where id=$1',[id(n)])).rows[0];
  const snapshot = async () => (await db.query('select (select jsonb_agg(w order by user_id) from customer_wallets w) wallets,(select count(*) from wallet_transactions) ledger')).rows[0];
  // An old automatic expiry can safely accept a delayed verified payment.
  await add(10,60,'EXPIRED');
  await db.query("update wallet_topup_requests set rejection_reason='Payment session expired. Start a new top-up if you still want to add money.' where id=$1",[id(10)]);
  await add(11,60,'EXPIRED');
  const migration=fs.readFileSync('supabase/migrations/20261025_090000_wallet_topup_timeout.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  assert.equal((await row(10)).status,'REJECTED');assert((await row(10)).auto_rejected_at);
  assert.equal((await row(11)).status,'EXPIRED');
  const sweep = async user => (await db.query('select reject_stale_wallet_topups($1) n',[user ? id(user) : null])).rows[0].n;
  const finish = async (n,binance=false,ref='gateway-'+n,tx='tx-'+n) =>
   (await db.query('select '+(binance?'complete_binance_wallet_topup':'complete_wallet_gateway_topup')+'($1,$2,$3) result',[id(n),ref,tx])).rows[0].result;
  await add(20,31);await add(21,60,'PENDING',2);await add(22,29);
  await add(23,60,'APPROVED');await add(24,60,'REJECTED');
  await add(25);await db.query('update wallet_topup_requests set paid_at=now() where id=$1',[id(25)]);
  await add(26);await db.query("update wallet_topup_requests set gateway_transaction_id='paid' where id=$1",[id(26)]);
  await add(27);await db.query("insert into wallet_transactions(user_id,transaction_type,amount,balance_before,balance_after,reference_id) values($1,'CREDIT',25,75,100,$2)",[id(1),id(27)]);
  const original=await snapshot();
  assert.equal(await sweep(1),1);assert.equal((await row(20)).status,'REJECTED');
  assert.equal((await row(21)).status,'PENDING','Scoped customer sweep must not change other customers');
  assert.equal(await sweep(),1);assert.equal(await sweep(),0);
  for (const n of [22,25,26,27]) assert.equal((await row(n)).status,'PENDING');
  assert.equal((await row(23)).status,'APPROVED');assert.equal((await row(24)).auto_rejected_at,null);
  assert.deepEqual(await snapshot(),original,'Timeout never debits, credits or refunds a wallet');
  // Stable transaction time makes the exact boundary deterministic.
  await db.exec('begin');await add(30,30);await add(31,29.999);
  assert.equal(await sweep(),1);assert.equal((await row(30)).status,'REJECTED');assert.equal((await row(31)).status,'PENDING');await db.exec('rollback');
  for (const [n,method] of [[40,'PALLY'],[41,'FREEKASSA'],[42,'USDT_DIRECT'],[43,'BINANCE_PAY'],[44,'UPI']]) await add(n,31,'PENDING',1,method);
  assert.equal(await sweep(),5);
  // Both callback implementations must recover only automatic rejections.
  for (const [n,binance] of [[40,false],[41,false],[42,false],[43,true],[10,false]]) {
   await assert.rejects(finish(n,binance,'wrong'),/verification failed/);
   await assert.rejects(finish(n,binance,'gateway-'+n,''),/verification failed/);
   assert.equal((await finish(n,binance)).alreadyCompleted,false);
   const paid=await snapshot();
   assert.equal((await finish(n,binance)).alreadyCompleted,true);
   assert.deepEqual(await snapshot(),paid);
   assert.equal((await row(n)).status,'APPROVED');assert.equal((await row(n)).rejection_reason,null);
   assert((await row(n)).auto_rejected_at,'Keep timeout timestamp for audit');
  }
  for (const binance of [false,true]) await assert.rejects(finish(24,binance),/cannot be completed/);
  await db.query('update wallet_topup_requests set reviewed_by=$1 where id=$2',[id(1),id(44)]);
  await assert.rejects(finish(44),/cannot be completed/,'Admin decisions must not be overridden');
  // Either ordering of scheduled rejection and confirmation is safe.
  await add(50);await finish(50);await sweep();assert.equal((await row(50)).status,'APPROVED');
  await add(51);await sweep();await Promise.all([finish(51),finish(51)]);
  assert.equal((await db.query('select count(*)::int n from wallet_transactions where reference_id=$1',[id(51)])).rows[0].n,1);
  // A failed ledger write rolls back the completion and wallet balance.
  await add(60);await sweep();const beforeFailure=await snapshot();
  await db.exec("create function test_ledger_failure() returns trigger language plpgsql as $$begin raise exception 'Ledger offline';end$$;create trigger fail_ledger before insert on wallet_transactions for each row execute function test_ledger_failure()");
  await assert.rejects(finish(60),/Ledger offline/);assert.deepEqual(await snapshot(),beforeFailure);assert.equal((await row(60)).status,'REJECTED');
  await db.exec('drop trigger fail_ledger on wallet_transactions');
  // Only trusted server code can expire or credit requests.
  for (const role of ['anon','authenticated']) {
   await db.exec('set role '+role);
   await assert.rejects(sweep(),/permission denied/);
   await assert.rejects(finish(60),/permission denied/);
   await assert.rejects(finish(60,true),/permission denied/);
   await assert.rejects(db.exec("update wallet_topup_requests set auto_rejected_at=now()"),/permission denied/);
   await db.exec('reset role');
  }
  await db.exec('set role service_role');assert.equal(await sweep(),0);await finish(60);await db.exec('reset role');
  console.log('Wallet timeout database checks passed: exact cutoff, customer scope, all payment methods, paid/ledger protection, zero balance changes on rejection, late confirmation, idempotency, rollback and permissions.');
 } finally {await db.close();}
})().catch(error=>{console.error(error);process.exitCode=1});
