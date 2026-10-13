const {PGlite}=require('@electric-sql/pglite');
const fs=require('node:fs');
const assert=require('node:assert/strict');
(async()=>{
 const db=new PGlite();
 await db.exec("create role anon; create role authenticated; create role service_role bypassrls; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values ('11111111-1111-4111-8111-111111111111');");
 await db.exec(fs.readFileSync('supabase/migrations/20261013_120000_fkwallet_admin.sql','utf8'));
 const id='22222222-2222-4222-8222-222222222222';
 await db.exec('set role service_role');
 await db.query("insert into public.fkwallet_transactions(id,admin_user_id,connection_id,summary,request_ciphertext) values($1,'11111111-1111-4111-8111-111111111111','account','{}','encrypted')",[id]);
 const claim=()=>db.query("update public.fkwallet_transactions set state='SUBMITTING' where id=$1 and state='READY' and expires_at>now() returning id",[id]);
 assert.equal((await claim()).rows.length,1);
 assert.equal((await claim()).rows.length,0);
 for(const role of ['anon','authenticated']){
   await db.exec('reset role; set role '+role);
   for(const table of ['fkwallet_settings','fkwallet_transactions']){
     await assert.rejects(db.query('select * from public.'+table),/permission denied/);
     await assert.rejects(db.query('delete from public.'+table),/permission denied/);
   }
   await assert.rejects(db.query("select nextval('public.fkwallet_transactions_reference_seq')"),/permission denied/);
 }
 await db.exec('reset role');
 assert.equal((await db.query("select count(*)::int n from pg_class where relname in ('fkwallet_settings','fkwallet_transactions') and relrowsecurity")).rows[0].n,2);
 await db.close();
 console.log('PASS: FKWallet migration, atomic purchase claim, private tables and sequence permissions');
})().catch(error=>{console.error(error);process.exitCode=1;});
