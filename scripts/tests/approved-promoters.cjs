const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
function load(file, mocks = {}) {
  const exports = {};
  new Function('require', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true}}).outputText)(name => name in mocks ? mocks[name] : require(name), exports);
  return exports;
}
const logic = load('lib/affiliate-promoters.ts');
assert.equal(logic.promoterDirectoryPath('approved'), '/admin/affiliates/approved');
assert.equal(logic.promoterDirectoryPath('https://elsewhere.invalid'), '/admin/affiliates/promoters');
assert.deepEqual(logic.filterPromotersByEmail([{email:'One+Shop@Example.com'},{email:'other@example.net'}], ' ONE+SHOP@ '), [{email:'One+Shop@Example.com'}]);

(async () => {
  let mode, ranges = [], running = 0, maxRunning = 0, emailCalls = 0;
  const row = n => ({id:`account-${n}`,user_id:`user-${n}`,status:'APPROVED',full_name:'Promoter'});
  const admin = {from() {return {
    select(){return this}, eq(k,v){mode=['eq',k,v];return this}, neq(k,v){mode=['neq',k,v];return this}, order(){return this},
    range: async (a,b) => {ranges.push([a,b]);return {data:a===0?Array.from({length:1000},(_,i)=>row(i)):[row(1000)]};},
  };},auth:{admin:{getUserById:async id=>{running++;emailCalls++;maxRunning=Math.max(running,maxRunning);await new Promise(r=>setImmediate(r));running--;return {data:{user:{email:id+'@example.invalid'}}};}}}};
  const {loadAffiliatePromoters} = load('lib/admin-affiliate-promoters.ts', {'server-only':{}, '@/lib/supabase/admin':{createAdminClient:()=>admin}});
  const accounts = await loadAffiliatePromoters('approved');
  assert.deepEqual(mode,['eq','status','APPROVED']);assert.equal(accounts.length,1001);assert.equal(emailCalls,1001);assert(maxRunning<=6);assert.deepEqual(ranges,[[0,999],[1000,1999]]);assert(!('user_id' in accounts[0]));assert.equal(accounts[1000].email,'user-1000@example.invalid');
  await loadAffiliatePromoters('applications');assert.deepEqual(mode,['neq','status','APPROVED']);

  let user=null, allowed=false, reads=0, writes=[], invalidated=[];
  const session={auth:{getUser:async()=>({data:{user}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:allowed?{user_id:'admin'}:null})})};
  const redirect=url=>{throw new Error('REDIRECT:'+url);};
  const shared={'next/navigation':{redirect}, '@/lib/affiliate-promoters':logic, '@/lib/supabase/server':{createClient:async()=>session}, '@/lib/supabase/admin-session':{createClient:async()=>session}};
  const {default:Directory}=load('app/admin/affiliates/promoters/PromoterDirectory.tsx', {...shared,'next/link':()=>null,'../../AdminSidebar':()=>null,'./PromoterList':()=>null,'@/lib/admin-affiliate-promoters':{loadAffiliatePromoters:async()=>{reads++;return [];}}});
  await assert.rejects(Directory({view:'approved',searchParams:Promise.resolve({})}),/admin\/login/);assert.equal(reads,0);
  user={id:'admin'};await assert.rejects(Directory({view:'approved',searchParams:Promise.resolve({})}),/Access denied/);assert.equal(reads,0);
  allowed=true;await Directory({view:'approved',searchParams:Promise.resolve({})});assert.equal(reads,1);
  const {savePromoterSettings}=load('app/admin/affiliates/promoters/actions.ts', {...shared,'next/cache':{revalidatePath:path=>invalidated.push(path)},'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({update:values=>({eq:async(key,id)=>{writes.push({values,key,id});return {error:null};}})})})}});
  const form=new FormData();form.set('affiliate_id','00000000-0000-4000-8000-000000000001');form.set('status','SUSPENDED');form.set('commission_override_percent','2.25');form.set('return_view','approved');form.set('search','shop+one@example.com');
  allowed=false;await assert.rejects(savePromoterSettings(form),/Access denied/);assert.equal(writes.length,0);allowed=true;
  await assert.rejects(savePromoterSettings(form), error=>{const url=new URL(error.message.replace('REDIRECT:',''),'https://example.invalid');assert.equal(url.pathname,'/admin/affiliates/approved');assert.equal(url.searchParams.get('q'),'shop+one@example.com');return true;});
  assert.equal(writes[0].values.status,'SUSPENDED');assert.equal(writes[0].values.commission_override_percent,2.25);assert(invalidated.includes('/admin/affiliates/approved'));assert(invalidated.includes('/admin/affiliates/promoters'));
  form.set('commission_override_percent','26');await assert.rejects(savePromoterSettings(form),/error=/);assert.equal(writes.length,1);
  console.log('PASS: email filtering, status separation, complete paging, bounded email lookup, admin-only access, promoter save and safe return path.');
})().catch(error=>{console.error(error);process.exitCode=1;});
