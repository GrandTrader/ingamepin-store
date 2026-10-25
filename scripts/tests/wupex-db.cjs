const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
(async()=>{
 const db=new PGlite();
 try{
  await db.exec('create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);grant usage on schema public to anon,authenticated,service_role;');
  const migration=fs.readFileSync('supabase/migrations/20261026_010000_wupex_connection.sql','utf8');
  await db.exec(migration);await db.exec(migration);
  const id='00000000-0000-4000-8000-000000000001';
  await db.query('insert into auth.users values($1)',[id]);
  await db.exec('set role service_role');
  await db.query('insert into wupex_settings(credentials_ciphertext,updated_by) values($1,$2)',['encrypted-test',id]);
  assert.equal((await db.query('select count(*)::int n from wupex_settings')).rows[0].n,1);
  await assert.rejects(db.query('insert into wupex_settings(id,credentials_ciphertext,updated_by) values(false,$1,$2)',['encrypted-test',id]),/check constraint/);
  await db.exec('reset role');
  for(const role of ['anon','authenticated']){
   await db.exec('set role '+role);
   await assert.rejects(db.query('select * from wupex_settings'),/permission denied/);
   await assert.rejects(db.query("update wupex_settings set credentials_ciphertext='fake'"),/permission denied/);
   await assert.rejects(db.query('delete from wupex_settings'),/permission denied/);
   await db.exec('reset role');
  }
  assert.equal((await db.query("select relrowsecurity from pg_class where oid='public.wupex_settings'::regclass")).rows[0].relrowsecurity,true);
  console.log('Wupex settings database tests passed: idempotent migration, private storage, server-only access and single settings record.');
 } finally {await db.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
