const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const id = n => '00000000-0000-4000-8000-' + String(n).padStart(12, '0');
(async () => {
 const db = new PGlite();
 try {
  await db.exec([
   "create role anon;create role authenticated;create role service_role bypassrls;",
   "create schema auth;create table auth.users(id uuid primary key,email_confirmed_at timestamptz,raw_app_meta_data jsonb default '{}');",
   "create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;",
   "grant usage on schema public,auth to authenticated,anon,service_role;grant execute on function auth.uid() to authenticated,anon,service_role;",
   "create table admin_users(user_id uuid primary key references auth.users);",
   "create table customer_wallets(user_id uuid primary key references auth.users,balance numeric(12,2) check(balance>=0),currency text default 'USD',updated_at timestamptz);",
   "create table wallet_transactions(id uuid primary key default gen_random_uuid(),user_id uuid,transaction_type text,amount numeric,balance_before numeric,balance_after numeric,description text,reference_id text,created_at timestamptz default now());"
  ].join('\n'));
  for (const n of [1,2,3,4,5]) await db.query('insert into auth.users(id,email_confirmed_at) values($1,now())',[id(n)]);
  await db.query('insert into admin_users values($1),($2)',[id(1),id(2)]);
  await db.query('insert into customer_wallets(user_id,balance) values($1,500),($2,500),($3,100)',[id(3),id(4),id(5)]);
  const migration = fs.readFileSync('supabase/migrations/20261025_030000_wallet_withdrawals.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  const uid = async n => db.query("select set_config('test.uid',$1,false)",[n ? id(n) : '']);
  const access = async (n,enabled=true) => db.query('select set_wallet_withdrawal_access($1,$2,$3)',[id(n),enabled,id(1)]);
  const request = async (key,amount=100,network='TRC20',address='T'+'A'.repeat(33)) =>
    (await db.query('select request_wallet_withdrawal($1,$2,$3,$4) id',[id(key),amount,network,address])).rows[0].id;
  const review = async (rid,action,note='',admin=1) => db.query('select review_wallet_withdrawal($1,$2,$3,$4)',[rid,id(admin),action,note]);
  const cancel = async rid => db.query('select cancel_wallet_withdrawal($1)',[rid]);
  const snapshot = async () => (await db.query('select (select jsonb_agg(w order by user_id) from customer_wallets w) wallets,(select count(*) from wallet_transactions) ledger')).rows[0];
  const balance = async n => Number((await db.query('select balance from customer_wallets where user_id=$1',[id(n)])).rows[0].balance);
  await uid(null);await assert.rejects(request(10),/verified email/);
  await uid(3);await assert.rejects(request(10),/not enabled/);
  await access(3);await access(4);await access(5);
  await db.query('update auth.users set email_confirmed_at=null where id=$1',[id(3)]);await assert.rejects(request(10),/verified email/);
  await db.query('update auth.users set email_confirmed_at=now() where id=$1',[id(3)]);
  for (const amount of [null,'NaN','Infinity',0,-1,4.5,1.111]) await assert.rejects(request(10,amount),/valid amount|greater than/);
  await assert.rejects(request(10,100,'OTHER'),/network fee/);
  await assert.rejects(request(10,100,'BEP20','not-an-address'),/valid wallet address/);
  await assert.rejects(request(10,600),/Insufficient/);
  await db.query("update auth.users set raw_app_meta_data='{\"wallet_disabled\":true}' where id=$1",[id(3)]);await assert.rejects(request(10),/disabled/);
  await db.query("update auth.users set raw_app_meta_data='{}' where id=$1",[id(3)]);
  const first = await request(10);assert.equal(await balance(3),400);
  const quote = (await db.query('select network_fee,net_usdt from wallet_withdrawal_requests where id=$1',[first])).rows[0];
  assert.equal(Number(quote.network_fee),4.5);assert.equal(Number(quote.net_usdt),95.5);
  const held = await snapshot();
  assert.equal(await request(10),first);assert.deepEqual(await snapshot(),held);
  await assert.rejects(request(10,101),/different details/);
  await assert.rejects(request(11),/already have/);
  await access(3,false);assert.equal(await request(10),first);
  await uid(4);await assert.rejects(cancel(first),/not found/);
  await uid(3);await cancel(first);const released=await snapshot();await cancel(first);assert.deepEqual(await snapshot(),released);assert.equal(await balance(3),500);
  await assert.rejects(request(11),/not enabled/);await access(3);
  const second=await request(11,50,'BEP20','0x'+'a'.repeat(40));
  await assert.rejects(review(second,'PAY','0x'+'b'.repeat(64)),/Approve/);
  await assert.rejects(review(second,'APPROVE','',4),/Administrator/);
  await review(second,'APPROVE');await review(second,'APPROVE');
  await assert.rejects(cancel(second),/awaiting review/);
  await assert.rejects(review(second,'PAY','0x'+'b'.repeat(64),2),/assigned/);
  await assert.rejects(review(second,'PAY','bad-hash'),/transaction hash/);
  const beforePaid=await snapshot();await review(second,'PAY','0x'+'b'.repeat(64));await review(second,'PAY','0x'+'B'.repeat(64));
  assert.deepEqual(await snapshot(),beforePaid,'Paying/replaying never deducts again');
  await assert.rejects(review(second,'REJECT','mistake'),/cannot be rejected/);
  const third=await request(12,50,'BEP20','0x'+'c'.repeat(40));await review(third,'APPROVE');
  await assert.rejects(review(third,'PAY','0x'+'b'.repeat(64)),/unique/);
  await review(third,'REJECT','Unable to send');const rejected=await snapshot();await review(third,'REJECT','Unable to send');assert.deepEqual(await snapshot(),rejected);assert.equal(await balance(3),450);
  const sol=await request(13,10,'SOLANA','A'.repeat(44));
  const solQuote=(await db.query('select network_fee,net_usdt from wallet_withdrawal_requests where id=$1',[sol])).rows[0];
  assert.equal(Number(solQuote.network_fee),2.5);assert.equal(Number(solQuote.net_usdt),7.5);await review(sol,'REJECT','Test complete');
  // Replayed concurrent submissions share one request and one debit.
  await uid(5);const results=await Promise.all([request(20,80),request(20,80)]);assert.equal(results[0],results[1]);assert.equal(await balance(5),20);
  // An independent spend checks the same reduced wallet balance.
  await db.exec("create function test_spend(uid uuid,amount numeric) returns void language plpgsql as $$declare b numeric;begin select balance into b from customer_wallets where user_id=uid for update;if b<amount then raise exception 'Insufficient';end if;update customer_wallets set balance=b-amount where user_id=uid;end$$;");
  await assert.rejects(db.query('select test_spend($1,30)',[id(5)]),/Insufficient/);
  await cancel(results[0]);assert.equal(await balance(5),100);
  // A failed ledger write must roll back both the request and available balance.
  await uid(5);const safe=await snapshot();
  await db.exec("create function test_ledger_failure() returns trigger language plpgsql as $$begin raise exception 'Ledger offline';end$$;create trigger test_fail_ledger before insert on wallet_transactions for each row execute function test_ledger_failure();");
  await assert.rejects(request(21,10),/Ledger offline/);assert.deepEqual(await snapshot(),safe);
  assert.equal((await db.query('select count(*)::int n from wallet_withdrawal_requests where request_key=$1',[id(21)])).rows[0].n,0);
  await db.exec('drop trigger test_fail_ledger on wallet_transactions;drop function test_ledger_failure()');
  // Real role checks: own rows only, no table mutation, no admin RPC access.
  await uid(4);const other=await request(30,10);await uid(3);
  await db.exec('set role authenticated');
  const visible=await db.query('select distinct user_id from wallet_withdrawal_requests');assert.deepEqual(visible.rows,[{user_id:id(3)}]);
  assert.equal((await db.query('select count(*)::int n from wallet_withdrawal_events where user_id<>auth.uid()')).rows[0].n,0);
  await assert.rejects(db.exec("update wallet_withdrawal_access set enabled=true"),/permission denied/);
  await assert.rejects(db.exec("update wallet_withdrawal_requests set amount=1"),/permission denied/);
  await assert.rejects(review(other,'APPROVE'),/permission denied/);
  await assert.rejects(access(3),/permission denied/);
  await assert.rejects(cancel(other),/not found/);
  await db.exec('reset role;set role anon');await assert.rejects(request(99),/permission denied/);await assert.rejects(cancel(other),/permission denied/);await db.exec('reset role');
  for (const signature of ['request_wallet_withdrawal(uuid,numeric,text,text)','cancel_wallet_withdrawal(uuid)','set_wallet_withdrawal_access(uuid,boolean,uuid)','review_wallet_withdrawal(uuid,uuid,text,text)']) {
    assert.equal((await db.query("select has_function_privilege('anon',$1,'execute') ok",[signature])).rows[0].ok,false);
  }
  console.log('Withdrawal database tests passed: permissions, fees, ledger holds, release, replay, assignment, duplicate transfers and spending limits.');
 } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1});
