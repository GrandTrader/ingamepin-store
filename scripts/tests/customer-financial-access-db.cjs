const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const read=f=>fs.readFileSync('supabase/migrations/'+f,'utf8');
const part=(f,start,end)=>{const s=read(f);return s.slice(s.indexOf(start),s.indexOf(end));};
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
 create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_app_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('test.uid',true),'')::uuid$$;
 grant usage on schema public,auth to anon,authenticated,service_role;
 create table admin_users(user_id uuid primary key);create table bulk_api_clients(id uuid,contact_email text,status text);
 create table customer_login_events(id uuid default gen_random_uuid(),user_id uuid,created_at timestamptz default now(),browser_id uuid,ip_address inet);
 create table orders(id uuid primary key default gen_random_uuid(),customer_id uuid,customer_email text,customer_ip inet,paid_at timestamptz,status text default 'PENDING_PAYMENT',payment_expired_at timestamptz,payment_expires_at timestamptz,created_at timestamptz default now(),updated_at timestamptz);
 create table payments(id uuid primary key,order_id uuid,status text default 'PENDING',submitted_at timestamptz,transaction_id text,gateway_payment_id text,rejection_reason text,updated_at timestamptz);
 create table business_bank_invoices(id uuid default gen_random_uuid(),user_id uuid);
 create table business_bank_deposits(id uuid default gen_random_uuid(),user_id uuid);
 `);
 const schema=read('00000000_initial_schema.sql');
 for(const t of ['customer_wallets','wallet_transactions','wallet_topup_requests']){const at=schema.indexOf('create table if not exists public.'+t+' (');await db.exec(schema.slice(at,schema.indexOf('\n);',at)+4));}
 await db.exec(part('00000004_wallet_functions.sql','create or replace function public.create_wallet_topup_request','create or replace function public.pay_order_with_wallet'));
 await db.exec(part('20261023_120000_checkout_retry_expiry.sql','create or replace function public.assert_checkout_open','create or replace function public.prepare_order_payment_retry'));
 await db.exec(part('20261023_120000_checkout_retry_expiry.sql','create or replace function public.hold_expired_checkout_payment','-- Preserve the installed'));
 await db.exec(read('20261025_030000_wallet_withdrawals.sql'));
 await db.exec(read('20261025_090000_wallet_topup_timeout.sql'));
 await db.exec(read('20261026_230000_customer_purchase_access.sql'));
 for(let n=1;n<=5;n++){await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())',[id(n),`user${n}@example.invalid`]);await db.query('insert into customer_wallets(user_id,balance) values($1,100)',[id(n)]);}
 await db.query('insert into admin_users values($1)',[id(1)]);
 await db.query('insert into customer_login_events(user_id,browser_id,ip_address) values($1,$2,$3)',[id(2),id(20),'192.0.2.2']);
 const migration=read('20261027_010000_customer_financial_access.sql');await db.exec(migration);await db.exec(migration);
 const set=(u,enabled=true,devices=true,ips=false)=>db.query('select set_customer_purchase_restriction($1,$2,$3,$4,$5,$6)',[id(1),id(u),enabled,devices,ips,'Financial restriction test']);
 const access=async(u,b=null,ip=null)=>(await db.query('select customer_financial_access($1,$2,$3) ok',[id(u),b,ip])).rows[0].ok;
 const uid=n=>db.query("select set_config('test.uid',$1,false)",[id(n)]);
 const add=(n,user=2,method='PALLY')=>db.query("insert into wallet_topup_requests(id,user_id,amount,payment_method,status,gateway_order_id) values($1,$2,25,$3,'PENDING',$4)",[id(n),id(user),method,'gateway-'+n]);
 const finish=async(n,binance=false,tx='tx-'+n)=>(await db.query('select '+(binance?'complete_binance_wallet_topup':'complete_wallet_gateway_topup')+'($1,$2,$3) r',[id(n),'gateway-'+n,tx])).rows[0].r;
 const snap=async()=>(await db.query('select (select jsonb_agg(w order by user_id) from customer_wallets w) wallets,(select count(*) from wallet_transactions) ledger')).rows[0];
 const row=async n=>(await db.query('select * from wallet_topup_requests where id=$1',[id(n)])).rows[0];
 for(const[n,m]of [[10,'PALLY'],[11,'BINANCE_PAY'],[12,'FREEKASSA'],[13,'USDT_DIRECT'],[14,'PALLY']])await add(n,2,m);
 await finish(14); // Previously settled payments must remain idempotent after restriction.
 await db.query("insert into orders(id,customer_id,customer_email) values($1,$2,'user2@example.invalid')",[id(70),id(2)]);
 await db.query('insert into payments(id,order_id) values($1,$2)',[id(71),id(70)]);
 await db.query('select set_wallet_withdrawal_access($1,true,$2)',[id(2),id(1)]);await uid(2);
 const pending=(await db.query("select request_wallet_withdrawal($1,20,'BEP20',$2) id",[id(30),'0x'+'a'.repeat(40)])).rows[0].id;
 await set(2);assert.equal(await access(2),false);const frozen=await snap();
 // Normal, legacy and direct database creation all have the same denial.
 for(const method of ['PALLY','BINANCE_PAY','UPI','USDT_DIRECT','FREEKASSA'])await assert.rejects(db.query('select create_wallet_topup_request(25,$1,$2)',[method,'reference']),/Financial transactions are restricted/);
 await assert.rejects(add(16),/Financial transactions/);
 for(const t of ['business_bank_invoices','business_bank_deposits'])await assert.rejects(db.query('insert into '+t+'(user_id) values($1)',[id(2)]),/Financial transactions/);
 for(const amount of [90,120])await assert.rejects(db.query('update customer_wallets set balance=$1 where user_id=$2',[amount,id(2)]),/Financial transactions/);
 await assert.rejects(db.query("insert into wallet_transactions(user_id,transaction_type,amount,balance_after) values($1,'CREDIT',25,125)",[id(2)]),/Financial transactions/);
 await assert.rejects(db.query("select request_wallet_withdrawal($1,20,'BEP20',$2)",[id(31),'0x'+'a'.repeat(40)]),/pending withdrawal|Financial transactions/);
 await assert.rejects(db.query("select review_wallet_withdrawal($1,$2,'APPROVE','')",[pending,id(1)]),/Financial transactions/);
 await assert.rejects(db.query('select cancel_wallet_withdrawal($1)',[pending]),/Financial transactions/);
 await assert.rejects(db.query('select approve_wallet_topup($1,$2)',[id(10),id(1)]),/Financial transactions/);
 assert.deepEqual(await snap(),frozen);
 // Wallet-only disable also closes the legacy direct-RPC path.
 await db.query(`update auth.users set raw_app_meta_data='{"wallet_disabled":true}' where id=$1`,[id(3)]);await uid(3);
 assert.equal(await access(3),false);await assert.rejects(db.query("select create_wallet_topup_request(25,'PALLY','legacy')"),/Financial transactions/);
 // Same recorded browser on a different account cannot omit it on a direct call.
 assert.equal(await access(4,id(20),'192.0.2.44'),false);assert.equal(await access(4),false);
 await uid(4);await assert.rejects(db.query("select create_wallet_topup_request(25,'PALLY','device')"),/Financial transactions/);
 await set(2,true,false,false);assert.equal(await access(4),true);await set(2,true,true,true);
 assert.equal(await access(5,null,'192.0.2.2'),false);await set(2,true,true,false);assert.equal(await access(5),true);
 // Verified callbacks record a hold without any balance/ledger changes, including retries.
 for(const[n,b]of [[10,false],[11,true],[12,false],[13,false]]){
  assert.equal((await finish(n,b)).held,true);assert.equal((await finish(n,b)).alreadyCompleted,true);
  await assert.rejects(finish(n,b,'different-tx'),/different payment/);
  const r=await row(n);assert(r.paid_at);assert(r.financial_hold_at);assert.equal(r.gateway_transaction_id,'tx-'+n);assert.equal(r.status,'PENDING');
  await assert.rejects(db.query('select reject_wallet_topup($1,$2,$3)',[id(n),id(1),'Unpaid']),/Payment was received/);
 }
 assert.equal((await finish(14)).alreadyCompleted,true);assert.deepEqual(await snap(),frozen);
 await db.query("update wallet_topup_requests set created_at=now()-interval '2 hours' where id=$1",[id(10)]);await db.query('select reject_stale_wallet_topups(null)');assert.equal((await row(10)).status,'PENDING');
 const hold=(await db.query('select hold_expired_checkout_payment($1,$2) r',[id(71),'order-tx'])).rows[0].r;assert.equal(hold.requiresReview,true);
 await assert.rejects(db.query("update orders set paid_at=now(),status='DELIVERED' where id=$1",[id(70)]),/financial transactions are restricted/);
 assert.equal((await db.query('select status from orders where id=$1',[id(70)])).rows[0].status,'PAYMENT_REVIEW');
 // Unblock does not silently credit held receipts. Explicit admin approval credits once.
 await set(2,false);assert.equal((await finish(10)).held,true);assert.deepEqual(await snap(),frozen);
 await db.query('select approve_wallet_topup($1,$2)',[id(10),id(1)]);assert((await row(10)).financial_hold_released_at);
 const released=await snap();await db.query('select approve_wallet_topup($1,$2)',[id(10),id(1)]);assert.deepEqual(await snap(),released);
 await uid(5);assert((await db.query("select create_wallet_topup_request(20,'PALLY','allowed') r")).rows[0].r);
 // Private guards cannot be invoked or given spoofed identities by browser roles.
 for(const role of ['anon','authenticated'])for(const fn of ['customer_financial_access(uuid,uuid,text)','assert_customer_financial_access(uuid)','hold_restricted_wallet_payment(uuid,text,text)'])assert.equal((await db.query("select has_function_privilege($1,$2,'execute') ok",[role,'public.'+fn])).rows[0].ok,false);
 console.log('PASS financial restriction DB: direct top-ups, bank deposits, balance/ledger freeze, withdrawals, recorded device/IP matches, wallet-only disable, safe payment holds, expiry, retries, manual release, order review and permissions.');
}finally{await db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
