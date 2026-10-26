const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
(async()=>{const db=new PGlite();try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
 create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
 create table admin_users(user_id uuid primary key);
 create table bulk_api_clients(id uuid primary key,contact_email text,status text);
 create table customer_login_events(id uuid default gen_random_uuid(),user_id uuid,created_at timestamptz default now(),browser_id uuid,ip_address inet);
 create table orders(id uuid primary key default gen_random_uuid(),customer_id uuid,customer_email text,customer_ip inet,paid_at timestamptz,status text default 'PENDING_PAYMENT',payment_expired_at timestamptz,payment_expires_at timestamptz,created_at timestamptz default now());
 create function require_approved_business(uuid) returns void language plpgsql as $$begin if $1 is null then raise exception 'missing business';end if;end$$;
 create function create_store_order(text,text,text,text,jsonb,text) returns jsonb language plpgsql as $$declare o orders%rowtype;begin insert into orders(customer_email) values($2) returning * into o;return jsonb_build_object('id',o.id);end$$;
 create function assert_order_denomination_limits(uuid) returns void language sql as 'select';
 create function portal_wallet_checkout(p_user uuid,p_request uuid,p_action text,p_items jsonb,p_reference text,p_expected numeric,p_ip text) returns jsonb language plpgsql as $$begin if p_action='recover' then return case when p_reference='committed' then jsonb_build_object('paid',true) else null end;end if;return public.create_business_checked_order('Buyer','second@example.invalid','','wallet',p_items,null,p_user);end$$;
 `);
 // Load the actual existing wrapper/expiry functions that the migration extends.
 for(const [file,start,end] of [
 ['20260928_140000_business_kyb.sql','create function public.create_business_checked_order','create function public.save_business_bank_settings'],
 ['20261013_190000_denomination_purchase_limits.sql','create or replace function public.create_purchase_checked_order','-- Check portal quotes'],
 ['20261023_120000_checkout_retry_expiry.sql','create or replace function public.assert_checkout_open','create or replace function public.prepare_order_payment_retry']]){
  const s=fs.readFileSync('supabase/migrations/'+file,'utf8');await db.exec(s.slice(s.indexOf(start),s.indexOf(end)));
 }
 await db.query(`insert into auth.users values($1,'admin@example.invalid',now()),($2,'first@example.invalid',now()),($3,'second@example.invalid',now()),($4,'third@example.invalid',now())`,[id(1),id(2),id(3),id(4)]);
 await db.query('insert into admin_users values($1)',[id(1)]);
 await db.query('insert into bulk_api_clients values($1,$2,$3)',[id(70),'first@example.invalid','ACTIVE']);
 await db.query(`insert into customer_login_events(user_id,browser_id,ip_address) values($1,$2,'2001:db8::1')`,[id(2),id(20)]);
 await db.query(`insert into customer_login_events(user_id,browser_id,ip_address,created_at) values($1,$2,'192.0.2.99',now()-interval '181 days')`,[id(2),id(29)]);
 await db.query(`insert into orders(id,customer_id,customer_email) values($1,$2,'first@example.invalid')`,[id(80),id(2)]);
 const migration=fs.readFileSync('supabase/migrations/20261026_230000_customer_purchase_access.sql','utf8');await db.exec(migration);await db.exec(migration);
 const set=(user,enabled=true,devices=true,ips=false,admin=id(1))=>db.query('select set_customer_purchase_restriction($1,$2,$3,$4,$5,$6)',[admin,user,enabled,devices,ips,'Investigation test']);
 const allowed=async(user=null,email=null,browser=null,ip=null,client=null)=>(await db.query('select customer_purchase_access($1,$2,$3,$4,$5) allowed',[user,email,browser,ip,client])).rows[0].allowed;
 assert.equal(await allowed(id(2)),true);
 await assert.rejects(set(id(2),true,true,false,id(3)),/Administrator access/);
 await assert.rejects(set(id(1)),/Administrator accounts/);
 await set(id(2));
 assert.equal(await allowed(id(2),'different@example.invalid'),false);
 assert.equal(await allowed(null,' FIRST@example.invalid '),false);
 assert.equal(await allowed(id(3),'second@example.invalid',id(20),'192.0.2.88'),false,'Different account and IP cannot bypass known browser');
 assert.equal(await allowed(id(3),null,id(29),'192.0.2.99'),true,'Expired history is not silently enrolled');
 assert.equal(await allowed(id(3),null,null,'2001:db8::1'),true,'Shared IP alone not blocked by default');
 assert.equal(await allowed(null,null,null,null,id(70)),false,'API owner restriction cannot be bypassed by posted customer email');
 await db.query('insert into customer_login_events(user_id,browser_id,ip_address) values($1,$2,$3)',[id(2),id(21),'192.0.2.3']);
 assert.equal(await allowed(id(3),null,id(21)),false,'Future sign-in links new browser, without preventing sign-in');
 await set(id(2),true,false,true);
 assert.equal(await allowed(id(3),null,id(20)),true,'Admin can disable device links');
 assert.equal(await allowed(id(3),null,null,'2001:0db8:0:0:0:0:0:1'),false,'Equivalent IPv6 addresses match');
 // A second restriction sharing this IP remains effective after the first is removed.
 await db.query('insert into customer_login_events(user_id,browser_id,ip_address) values($1,$2,$3)',[id(4),id(24),'2001:db8::1']);
 await set(id(4),true,true,true);await set(id(2),false);
 assert.equal(await allowed(id(2)),true);assert.equal(await allowed(id(3),null,id(20)),true);
 assert.equal(await allowed(id(3),null,null,'2001:db8::1'),false);
 await set(id(4),false);assert.equal(await allowed(id(3),null,null,'2001:db8::1'),true);
 await set(id(2));
 await assert.rejects(db.query(`insert into orders(customer_email) values('FIRST@example.invalid')`),/New purchases are restricted/);
 await assert.rejects(db.query(`select create_business_checked_order('Buyer','other@example.invalid','','wallet','[]',null,$1)`,[id(2)]),/New purchases are restricted/);
 await assert.rejects(db.query(`select create_customer_checked_order('Buyer','second@example.invalid','','wallet','[]',null,$1,null,'192.0.2.7',$2,false)`,[id(3),id(20)]),/New purchases are restricted/);
 await assert.rejects(db.query(`select create_customer_checked_order('Buyer','second@example.invalid','','wallet','[]',null,null,$1,null,null,false)`,[id(70)]),/New purchases are restricted/);
 for(const guard of [false,true])assert((await db.query(`select create_customer_checked_order('Buyer','second@example.invalid','','wallet','[]',null,$1,null,'192.0.2.7',$2,$3) result`,[id(3),id(23),guard])).rows[0].result.id);
 assert.equal((await db.query(`select customer_checked_portal_checkout($1,$2,'confirm','[]','committed',10,null,$3) result`,[id(2),id(60),id(20)])).rows[0].result.paid,true);
 assert.equal((await db.query(`select customer_checked_portal_checkout($1,$2,'recover','[]','new',10,null,$3) result`,[id(2),id(60),id(20)])).rows[0].result,null);
 await assert.rejects(db.query(`select customer_checked_portal_checkout($1,$2,'confirm','[]','new',10,null,$3)`,[id(2),id(60),id(20)]),/New purchases are restricted/);
 await assert.rejects(db.query('select assert_checkout_open($1)',[id(80)]),/New purchases are restricted/);
 await db.query(`update orders set paid_at=now(),status='DELIVERED' where id=$1`,[id(80)]);
 assert.equal((await db.query('select status from orders where id=$1',[id(80)])).rows[0].status,'DELIVERED','Delayed verified payments and prior history remain usable');
 await set(id(2),false);await db.query('update orders set paid_at=null,status=$1 where id=$2',['PENDING_PAYMENT',id(80)]);await db.query('select assert_checkout_open($1)',[id(80)]);
 await db.query(`update orders set payment_expired_at=now() where id=$1`,[id(80)]);await assert.rejects(db.query('select assert_checkout_open($1)',[id(80)]),/15-minute/);
 const state=(await db.query('select customer_purchase_restriction_state($1) s',[id(2)])).rows[0].s;assert.equal(state.enabled,false);assert.equal(state.devices,2);assert.equal(state.ips,2);
 assert.equal((await db.query('select count(*)::int n from customer_purchase_restriction_audit')).rows[0].n,7);
 const signatures=['customer_purchase_access(uuid,text,uuid,text,uuid)','set_customer_purchase_restriction(uuid,uuid,boolean,boolean,boolean,text)','customer_purchase_restriction_state(uuid)','create_customer_checked_order(text,text,text,text,jsonb,text,uuid,uuid,text,uuid,boolean)','customer_checked_portal_checkout(uuid,uuid,text,jsonb,text,numeric,text,uuid)'];
 for(const signature of signatures)for(const role of ['anon','authenticated','service_role'])assert.equal((await db.query('select has_function_privilege($1,$2,\'execute\') ok',[role,'public.'+signature])).rows[0].ok,role==='service_role');
 for(const table of ['customer_purchase_restrictions','customer_purchase_restriction_keys','customer_purchase_restriction_audit','customer_purchase_observations']){assert.equal((await db.query('select relrowsecurity as rls from pg_class where oid=$1::regclass',['public.'+table])).rows[0].rls,true);for(const role of ['anon','authenticated'])assert.equal((await db.query('select has_table_privilege($1,$2,\'select\') ok',[role,'public.'+table])).rows[0].ok,false);}
 // A remembered checkout browser is available even if no new sign-in event was written.
 await allowed(id(3),'second@example.invalid',id(33),'192.0.2.33');await set(id(3));
 assert.equal(await allowed(null,'other@example.invalid',id(33)),false);
 await set(id(3),false);
 const made=(await db.query(`select create_customer_checked_order('Buyer','alternate@example.invalid','','wallet','[]',null,$1) result`,[id(3)])).rows[0].result;
 assert.equal((await db.query('select customer_id from orders where id=$1',[made.id])).rows[0].customer_id,id(3));
 // Retained email restriction also prevents delete/recreate bypass.
 await set(id(2));await db.query('delete from auth.users where id=$1',[id(2)]);assert.equal(await allowed(null,'first@example.invalid'),false);
 console.log('PASS database: account/email/browser/IP, APIs, IPv6, unblock overlap, future login, direct order guard, safe recovery, unpaid retry, delayed payment, audit, permissions and repeatable migration.');
}finally{await db.close()}})().catch(e=>{console.error(e);process.exitCode=1});
