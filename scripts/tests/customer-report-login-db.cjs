const fs=require('fs'),assert=require('node:assert/strict'),{PGlite}=require('@electric-sql/pglite');
(async()=>{
const db=new PGlite();
await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;
create table auth.users(id uuid primary key);
create table auth.audit_log_entries(id uuid primary key,created_at timestamptz,payload json,ip_address varchar(64));
create table auth.sessions(id uuid primary key,user_id uuid,created_at timestamptz,refreshed_at timestamp,ip inet,user_agent text,refresh_token_hmac_key text);
insert into auth.users values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');`);
const sql=fs.readFileSync('supabase/migrations/20261026_170000_customer_report_login_history.sql','utf8');await db.exec(sql);await db.exec(sql);
const deviceSql=fs.readFileSync('supabase/migrations/20261026_180000_customer_report_device_details.sql','utf8');await db.exec(deviceSql);await db.exec(deviceSql);
const user='00000000-0000-4000-8000-000000000001',other='00000000-0000-4000-8000-000000000002';
await db.query(`insert into customer_login_events(user_id,ip_address,country_code,event_type,user_agent) values($1,'2001:db8::1','NL','PASSWORD_SIGN_IN','Test browser'),($2,'203.0.113.2','IN','AUTH_CALLBACK','Other browser')`,[user,other]);
await db.query(`insert into auth.audit_log_entries values(gen_random_uuid(),'2026-10-25T10:00Z',$1::json,'198.51.100.8'),(gen_random_uuid(),'2026-10-25T11:00Z',$2::json,'198.51.100.9'),(gen_random_uuid(),'2026-10-25T12:00Z',$3::json,'198.51.100.10')`,[JSON.stringify({actor_id:user,action:'login',secret:'DO_NOT_RETURN'}),JSON.stringify({actor_id:other,action:'login'}),JSON.stringify({actor_id:user,action:'user_deleted'})]);
await db.query(`insert into auth.sessions values(gen_random_uuid(),$1,'2026-10-25T10:00Z','2026-10-26T11:12:13','198.51.100.11','Session browser','DO_NOT_RETURN')`,[user]);
for(const role of ['anon','authenticated']){
 await db.exec('set role '+role);
 await assert.rejects(db.query('select * from customer_login_events'),/permission denied/);
 await assert.rejects(db.query("select * from customer_report_login_history($1,'AUTH_AUDIT')",[user]),/permission denied/);
 await assert.rejects(db.query("insert into customer_login_events(user_id,event_type) values($1,'PASSWORD_SIGN_IN')",[user]),/permission denied/);
 await assert.rejects(db.query('select * from customer_report_device_history($1)',[user]),/permission denied/);
 await db.exec('reset role');
}
await db.exec('set role service_role');
const website=(await db.query("select * from customer_report_login_history($1,'WEBSITE')",[user])).rows;assert.equal(website.length,1);assert.equal(website[0].ip_address,'2001:db8::1');
const audit=(await db.query("select * from customer_report_login_history($1,'AUTH_AUDIT')",[user])).rows;assert.equal(audit.length,1);assert.equal(audit[0].ip_address,'198.51.100.8');assert(!JSON.stringify(audit).includes('DO_NOT_RETURN'));
const sessions=(await db.query("select * from customer_report_login_history($1,'AUTH_SESSION')",[user])).rows;assert.equal(sessions.length,1);assert.equal(new Date(sessions[0].created_at).toISOString(),'2026-10-26T11:12:13.000Z');assert(!JSON.stringify(sessions).includes('DO_NOT_RETURN'));
await db.query("insert into customer_login_events(user_id,ip_address,event_type) values($1,'203.0.113.7','SESSION_OBSERVED')",[user]);
await assert.rejects(db.query('delete from customer_login_events'),/permission denied/);
await assert.rejects(db.query("select * from customer_report_login_history($1,'INVALID')",[user]),/Invalid/);
await db.query("insert into customer_login_events(user_id,event_type,browser_id,device_details) values($1,'PASSWORD_SIGN_IN',$2,$3)",[user,'00000000-0000-4000-8000-000000000099',JSON.stringify({device_type:'mobile',model:'SM-S918B'})]);
const devices=(await db.query('select * from customer_report_device_history($1)',[user])).rows;assert.equal(devices.length,3);assert.equal(devices.filter(d=>d.browser_id).length,1);assert.equal(devices.find(d=>d.browser_id).device_details.model,'SM-S918B');
assert(devices.every(d=>Object.keys(d).sort().join(',')==='browser_id,created_at,device_details,id'));
await assert.rejects(db.query("insert into customer_login_events(user_id,event_type,device_details) values($1,'PASSWORD_SIGN_IN',$2)",[user,JSON.stringify({model:'x'.repeat(2200)})]),/constraint/);
await assert.rejects(db.query("update customer_login_events set browser_id=null"),/permission denied/);
await db.close();console.log('PASS: migration rerun, IP v4/v6, correct customer isolation, secret exclusion, UTC session snapshots and service-only permissions');
})().catch(e=>{console.error(e);process.exit(1)});
