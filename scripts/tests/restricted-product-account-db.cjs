const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
await db.exec(`create role anon; create role authenticated; create role service_role;
create schema auth; create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz);
create table public.orders(id uuid primary key,customer_id uuid,status text);
create table public.product_purchase_restrictions(product_id uuid primary key,is_enabled boolean);
create table public.order_items(id uuid primary key,order_id uuid,product_id uuid);
create function public.create_store_order(text,text,text,text,jsonb,text) returns jsonb language sql as 'select null::jsonb';
grant execute on function public.create_store_order(text,text,text,text,jsonb,text) to anon,authenticated;
`);
const p='00000000-0000-4000-8000-000000000001',free='00000000-0000-4000-8000-000000000002',u='00000000-0000-4000-8000-000000000003',bad='00000000-0000-4000-8000-000000000004',o='00000000-0000-4000-8000-000000000005',i='00000000-0000-4000-8000-000000000006';
await db.query('insert into auth.users values($1,$2,now()),($3,$4,null)',[u,'buyer@example.invalid',bad,'unverified@example.invalid']);
await db.query('insert into orders values($1,null,$2)',[o,'PENDING_PAYMENT']);
await db.query('insert into product_purchase_restrictions values($1,true),($2,false)',[p,free]);
const sql=fs.readFileSync('supabase/migrations/20261024_140000_restricted_product_verified_accounts.sql','utf8');await db.exec(sql);await db.exec(sql);
assert.deepEqual((await db.query("select has_function_privilege('anon','public.create_store_order(text,text,text,text,jsonb,text)','execute') a,has_function_privilege('authenticated','public.create_store_order(text,text,text,text,jsonb,text)','execute') b,has_function_privilege('service_role','public.create_store_order(text,text,text,text,jsonb,text)','execute') c")).rows[0],{a:false,b:false,c:true});
async function attempt(actor,product,ok){await db.exec('begin');try{await db.query("select set_config('app.business_buyer',$1,true)",[actor||'']);const insert=()=>db.query('insert into order_items values($1,$2,$3)',[i,o,product]);if(ok){await insert();assert.equal((await db.query('select customer_id from orders where id=$1',[o])).rows[0].customer_id,product===p?u:null);}else await assert.rejects(insert(),/verified account|another account/);}finally{await db.exec('rollback');}}
await attempt(null,p,false);await attempt(bad,p,false);await attempt('00000000-0000-4000-8000-000000000099',p,false);await attempt(u,p,true);await attempt(null,free,true);
await db.query('update orders set customer_id=$1 where id=$2',[bad,o]);await attempt(u,p,false);
await db.query('update orders set customer_id=null,status=$1 where id=$2',['DELIVERED',o]);assert.equal((await db.query('select status from orders where id=$1',[o])).rows[0].status,'DELIVERED');
console.log('Database checks passed: anonymous/unverified rejected, verified bound to order, disabled limits stay guest-friendly, direct RPC closed, migration repeatable, existing orders preserved.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1});
