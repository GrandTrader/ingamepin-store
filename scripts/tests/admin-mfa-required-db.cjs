const assert=require('node:assert/strict');const fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_PATH||'@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
create function auth.jwt() returns jsonb language sql stable as $$ select jsonb_build_object('aal',nullif(current_setting('request.jwt.claim.aal',true),'')) $$;
create table auth.mfa_factors(id int primary key,user_id uuid,status text);
create table public.admin_users(user_id uuid primary key,role text);
create function public.is_admin() returns boolean language sql stable security definer set search_path=public as $$select exists(select 1 from admin_users where user_id=auth.uid())$$;
alter table admin_users enable row level security;
create policy "Admins read admin users" on admin_users for select using(public.is_admin());
create table public.orders(id int primary key,customer_id uuid);
alter table orders enable row level security;
create policy "Users read own orders" on orders for select using(customer_id=auth.uid() or public.is_admin());
grant usage on schema public,auth to anon,authenticated,service_role;
grant select on admin_users,orders to anon,authenticated;
grant all on admin_users,orders to service_role;
`);
const admin='00000000-0000-4000-8000-000000000001',customer='00000000-0000-4000-8000-000000000002',other='00000000-0000-4000-8000-000000000003';
await db.query("insert into admin_users values($1,'OWNER'),($2,'ADMIN')",[admin,other]);await db.query('insert into orders values(1,$1)',[customer]);
const sql=fs.readFileSync('supabase/migrations/20261002_120000_require_admin_mfa.sql','utf8');await db.exec(sql);await db.exec(sql);
async function asUser(id,aal){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false),set_config('request.jwt.claim.aal',$2,false)",[id,aal]);await db.exec('set role authenticated');}
async function count(table){return (await db.query('select count(*)::int n from '+table)).rows[0].n;}
async function allowed(){return (await db.query('select public.is_admin() ok')).rows[0].ok;}
await asUser(admin,'aal1');assert.equal(await count('admin_users'),1);assert.equal(await count('orders'),0);assert.equal(await allowed(),false);
await asUser(admin,'aal2');assert.equal(await allowed(),false);assert.equal(await count('orders'),0);
await db.exec('reset role');await db.query("insert into auth.mfa_factors values(1,$1,'unverified')",[admin]);
await asUser(admin,'aal2');assert.equal(await allowed(),false);
await db.exec("reset role;update auth.mfa_factors set status='verified'");
await asUser(admin,'aal1');assert.equal(await allowed(),false);assert.equal(await count('orders'),0);
await asUser(admin,'aal2');assert.equal(await allowed(),true);assert.equal(await count('orders'),1);assert.equal(await count('admin_users'),2);
await db.exec('reset role;delete from auth.mfa_factors');await asUser(admin,'aal2');assert.equal(await allowed(),false);assert.equal(await count('orders'),0);
await asUser(customer,'aal1');assert.equal(await count('orders'),1);assert.equal(await count('admin_users'),0);assert.equal(await allowed(),false);
await db.exec('reset role');await db.query("insert into auth.mfa_factors values(2,$1,'verified')",[customer]);await asUser(customer,'aal2');assert.equal(await allowed(),false);
await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub','',false),set_config('request.jwt.claim.aal','',false)");await db.exec('set role anon');assert.equal(await count('orders'),0);assert.equal(await allowed(),false);
await db.exec('reset role;set role service_role');assert.equal(await count('orders'),1);
console.log('PASS: MFA database rules deny AAL1, missing/unverified/removed factors and non-admins; own membership permits setup, customer access and service jobs preserved; migration repeatable.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
