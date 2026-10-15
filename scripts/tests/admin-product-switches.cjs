const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
const id = '00000000-0000-4000-8000-000000000001';
function harness({ signedIn=true, admin=true, mfa=true, status='ACTIVE', failure=false }={}) {
  const writes=[], paths=[], tags=[];
  const query = {
    update(value) { writes.push({value, filters:[]}); return this; },
    eq(key,value) { writes.at(-1).filters.push([key,value]); return this; },
    select() { return this; },
    async maybeSingle() { return { data: failure || writes.at(-1).filters.find(([k])=>k==='status')[1] !== status ? null : {name:'Test product'}, error: failure ? {message:'Private database detail'} : null }; },
  };
  const deps = {
    'next/cache': {revalidatePath:p=>paths.push(p),updateTag:t=>tags.push(t)},
    'next/navigation': {redirect:p=>{throw Error('REDIRECT '+p)}},
    '@/lib/supabase/admin-session': {createClient:async()=>{if(!mfa)throw Error('MFA required');return {auth:{getUser:async()=>({data:{user:signedIn?{id:'admin'}:null}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:admin?{role:'ADMIN'}:null})})}}},
    '@/lib/supabase/admin': {createAdminClient:()=>({from:()=>query})},
    '@/lib/digiseller-api': {}, '@/lib/digiseller-stat-sync': {}, '@/lib/store-image-upload': {}, '@/lib/product-customer-fields-save': {},
  };
  const output={};
  new Function('exports','require',ts.transpileModule(fs.readFileSync('app/admin/products/actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(output,n=>{if(!(n in deps))throw Error(n);return deps[n]});
  const run=async(productId=id,current='ACTIVE')=>{const form=new FormData();form.set('product_id',productId);form.set('current_status',current);return output.toggleProductSales(form)};
  return {run,writes,paths,tags};
}
test('sales saves return in place, update only the selected product, and refresh list/catalogue data',async()=>{
  for(const status of ['ACTIVE','INACTIVE']) {
    const h=harness({status});
    assert.deepEqual(await h.run(id,status),{});
    assert.deepEqual(h.writes[0].filters,[['id',id],['status',status]]);
    assert.equal(h.writes[0].value.status,status==='ACTIVE'?'INACTIVE':'ACTIVE');
    assert.deepEqual(Object.keys(h.writes[0].value).sort(),['status','updated_at']);
    assert(h.paths.includes('/admin/products'));
    assert(h.tags.includes('business-catalogue')&&h.tags.includes('homepage-store-data'));
  }
});
test('invalid and draft inputs return inline errors without updating or navigating',async()=>{
  for(const [productId,status] of [['invalid','ACTIVE'],[id,'DRAFT'],[id,'OTHER']]) {
    const h=harness();assert((await h.run(productId,status)).error);assert.equal(h.writes.length,0);assert.equal(h.paths.length,0);
  }
});
test('failed or concurrent saves return inline errors and do not invalidate successful state',async()=>{
  for(const config of [{failure:true},{status:'INACTIVE'}]) {
    const h=harness(config);const result=await h.run();
    assert(result.error);assert(!result.error.includes('Private database detail'));assert.equal(h.paths.length,0);assert.equal(h.tags.length,0);
  }
});
test('sales changes still require login, admin membership and verified MFA',async()=>{
  for(const config of [{signedIn:false},{admin:false},{mfa:false}]) {
    const h=harness(config);await assert.rejects(h.run(),/REDIRECT|MFA/);assert.equal(h.writes.length,0);
  }
});
