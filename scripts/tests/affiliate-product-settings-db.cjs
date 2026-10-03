const assert=require('node:assert/strict'),fs=require('node:fs');
const {PGlite}=require(process.env.PGLITE_PATH||'@electric-sql/pglite');
(async()=>{const db=new PGlite();try{
  await db.exec(`create role anon;create role authenticated;create role service_role;
    create table products(id uuid primary key,name text,price numeric,affiliate_enabled boolean,affiliate_commission_percent numeric,affiliate_updated_at timestamptz,updated_at timestamptz);
    insert into products values('00000000-0000-4000-8000-000000000001','Apple',10,false,0,null,null),('00000000-0000-4000-8000-000000000002','Steam',20,true,3,null,null),('00000000-0000-4000-8000-000000000003','Xbox',30,false,0,null,null);`);
  const sql=fs.readFileSync('supabase/migrations/20261003_110000_bulk_affiliate_product_settings.sql','utf8');await db.exec(sql);await db.exec(sql);
  const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002',c='00000000-0000-4000-8000-000000000003';
  const save=changes=>db.query('select save_displayed_affiliate_products($1) as count',[JSON.stringify(changes)]);
  const read=async()=> (await db.query('select id,price,affiliate_enabled,affiliate_commission_percent from products order by id')).rows;
  await save([{id:a,enabled:true,commission:2.25},{id:c,enabled:false,commission:1}]);
  const after=await read();assert.equal(Number(after[0].affiliate_commission_percent),2.25);assert.equal(after[0].affiliate_enabled,true);
  assert.equal(Number(after[1].affiliate_commission_percent),3,'Hidden product rate must be unchanged');assert.equal(Number(after[1].price),20);
  assert.equal(after[2].affiliate_enabled,false);assert.equal(Number(after[2].affiliate_commission_percent),1);
  for(const bad of [null,[],[{id:a,enabled:true,commission:26}],[{id:a,enabled:true,commission:0}],[{id:a,enabled:true,commission:1.001}],[{id:a,enabled:'false',commission:2}],[{id:a,enabled:true}],[{id:a,enabled:true,commission:2},{id:a,enabled:false,commission:0}],[{id:a,enabled:true,commission:4},{id:'00000000-0000-4000-8000-000000000099',enabled:true,commission:2}]]) {
    await assert.rejects(save(bad));assert.deepEqual(await read(),after,'Invalid or missing rows must roll back the entire save');
  }
  for(const role of ['anon','authenticated'])assert.equal((await db.query(`select has_function_privilege('${role}','public.save_displayed_affiliate_products(jsonb)','execute') as ok`)).rows[0].ok,false);
  assert.equal((await db.query("select has_function_privilege('service_role','public.save_displayed_affiliate_products(jsonb)','execute') as ok")).rows[0].ok,true);
  console.log('PASS: exact filtered updates, independent row rates, hidden prices/settings unchanged, atomic rollback, repeated migration and permissions.');
}finally{await db.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
