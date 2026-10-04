const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require('@electric-sql/pglite');
const h=c=>c.repeat(64);
test('OTP storage: permissions, expiry, committed lockout, one-use verification and atomic limiter',async()=>{
 const db=new PGlite();
 try {
  await db.exec('create role anon; create role authenticated; create role service_role;');
  await db.exec(fs.readFileSync('supabase/migrations/20261005_010000_guest_purchase_security.sql','utf8'));
  const challenge=async(id,expiry="now()+interval '10 minutes'")=>db.query(`insert into guest_purchase_challenges(token_hash,email,code_hash,expires_at) values($1,'fixture@example.invalid',$2,${expiry})`,[h(id),h('a')]);
  const verify=async(id,code='a',session='f')=>(await db.query('select verify_guest_purchase_otp($1,$2,$3) as email',[h(id),h(code),h(session)])).rows[0].email;
  await challenge('1');
  for(let i=0;i<5;i++)assert.equal(await verify('1','b'),null);
  assert.equal((await db.query('select attempts from guest_purchase_challenges where token_hash=$1',[h('1')])).rows[0].attempts,5);
  assert.equal(await verify('1'),null,'Correct code cannot unlock an exhausted challenge');
  await challenge('2',"now()-interval '1 minute'");assert.equal(await verify('2'),null);
  await challenge('3');assert.equal(await verify('3'),'fixture@example.invalid');assert.equal(await verify('3'),null,'No replay');
  assert.equal((await db.query('select count(*)::int as n from guest_purchase_sessions')).rows[0].n,1);
  const session=await db.query("select expires_at>now() and expires_at<=now()+interval '1 hour' as valid from guest_purchase_sessions");assert.equal(session.rows[0].valid,true);
  const attempts=await Promise.all(Array.from({length:12},()=>db.query('select consume_security_rate($1,10,60) as allowed',[h('b')])));
  assert.equal(attempts.filter(r=>r.rows[0].allowed).length,10);
  await db.query("update security_rate_limits set expires_at=now()-interval '1 second' where key_hash=$1",[h('b')]);
  assert.equal((await db.query('select consume_security_rate($1,10,60) as allowed',[h('b')])).rows[0].allowed,true);
  await challenge('4');const race=await Promise.all([verify('4','a','c'),verify('4','a','d')]);assert.equal(race.filter(Boolean).length,1);
  for(const role of ['anon','authenticated']) {
    await db.exec(`set role ${role}`);
    await assert.rejects(db.query('select * from guest_purchase_sessions'),/permission denied/);
    await assert.rejects(db.query('select verify_guest_purchase_otp($1,$2,$3)',[h('1'),h('a'),h('e')]),/permission denied/);
    await assert.rejects(db.query('select consume_security_rate($1,10,60)',[h('e')]),/permission denied/);
    await db.exec('reset role');
  }
 } finally {await db.close();}
});
