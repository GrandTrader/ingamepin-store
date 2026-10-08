/* eslint-disable @typescript-eslint/no-require-imports */
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const product=(n,extra={})=>({id:id(n),name:'Game '+n,slug:'game-'+n,category_id:id(100),status:'DRAFT',updated_at:'2026-10-08T12:00:00Z',product_options:[{is_active:true,selling_price:'12.50'}],...extra});
function harness({rows=[product(1)],user=true,admin=true,mfa=true,readError=false,accessError=false,race=[],saveError=[]}={}){
  const writes=[],tags=[],paths=[];let selectedIds=[],privilegedReads=0;
  function from(table){
    let values=null;const filters=[];
    const query={
      select(){return query;},in(key,ids){selectedIds=ids;return query;},eq(key,value){filters.push([key,value]);return query;},is(key,value){filters.push([key,value]);return query;},update(input){values=input;return query;},
      async maybeSingle(){
        if(table==='admin_users')return {data:admin?{user_id:id(200)}:null,error:accessError?{}:null};
        writes.push({values,filters});const target=filters.find(([key])=>key==='id')[1];
        return {data:race.includes(target)?null:{id:target},error:saveError.includes(target)?{message:'save failed'}:null};
      },
      then(resolve,reject){privilegedReads++;return Promise.resolve({data:rows.filter(row=>selectedIds.includes(row.id)),error:readError?{}:null}).then(resolve,reject);},
    };return query;
  }
  const deps={
    'next/cache':{revalidatePath:(...args)=>paths.push(args),updateTag:tag=>tags.push(tag)},
    '@/lib/supabase/admin-session':{createClient:async()=>{if(!mfa)throw Error('MFA required');return {auth:{getUser:async()=>({data:{user:user?{id:id(200)}:null}})},from};}},
    '@/lib/supabase/admin':{createAdminClient:()=>({from})},
  };
  const output={};const js=ts.transpileModule(fs.readFileSync('app/admin/products/bulk-actions.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  new Function('exports','require',js)(output,name=>{if(!(name in deps))throw Error('Unknown dependency '+name);return deps[name];});
  const run=async(ids=[id(1)])=>{const f=new FormData();ids.forEach(value=>f.append('product_ids',value));return output.activateSelectedProducts(f);};
  return {run,writes,tags,paths,get privilegedReads(){return privilegedReads;}};
}
test('publishes selected ready drafts and suspended products, reports skipped and already-active rows',async()=>{
  const h=harness({rows:[product(1),product(2,{status:'ACTIVE'}),product(3,{status:'INACTIVE'}),product(4,{category_id:null}),product(5,{product_options:[]}),product(6,{product_options:[{is_active:true,selling_price:0}]})]});
  const result=await h.run([1,2,3,4,5,6].map(id));
  assert.deepEqual(result.activated,[id(1),id(3)]);assert.equal(result.alreadyActive,1);assert.equal(result.skipped.length,3);
  assert.equal(h.writes.length,2);
  for(const write of h.writes){assert.deepEqual(Object.keys(write.values).sort(),['status','updated_at']);assert.equal(write.values.status,'ACTIVE');assert(write.filters.some(([k,v])=>k==='updated_at'&&v==='2026-10-08T12:00:00Z'));}
  assert.deepEqual(h.tags,['homepage-store-data','business-catalogue']);assert.deepEqual(h.paths,[['/','layout']]);
});
test('requires administrator membership and the verified MFA session before data access',async()=>{
  for(const config of [{user:false},{admin:false},{accessError:true}]){const h=harness(config);assert((await h.run()).error);assert.equal(h.privilegedReads,0);assert.equal(h.writes.length,0);}
  const h=harness({mfa:false});await assert.rejects(h.run(),/MFA required/);assert.equal(h.writes.length,0);
});
test('rejects empty, malformed and oversized selection without updates; deduplicates valid IDs',async()=>{
  for(const ids of [[],['bad-id'],Array.from({length:21},(_,i)=>id(i+1))]){const h=harness();assert((await h.run(ids)).error);assert.equal(h.privilegedReads,0);assert.equal(h.writes.length,0);}
  const h=harness();assert.equal((await h.run([id(1),id(1)])).activated.length,1);assert.equal(h.writes.length,1);
});
test('missing products and read failures abort before publishing anything',async()=>{
  for(const config of [{rows:[]},{readError:true}]){const h=harness(config);assert((await h.run()).error);assert.equal(h.writes.length,0);}
});
test('preserves intervening status edits and reports partial write failures accurately',async()=>{
  const h=harness({rows:[product(1),product(2),product(3)],race:[id(1)],saveError:[id(2)]});
  const result=await h.run([id(1),id(2),id(3)]);assert.deepEqual(result.activated,[id(3)]);assert.equal(result.skipped.length,2);assert.match(result.skipped[0].reason,/changed/);
  assert(h.writes.every(write=>write.filters.some(([k,v])=>k==='status'&&v==='DRAFT')));
});
test('does not republish already-active rows or invalidate caches on a no-op',async()=>{
  const h=harness({rows:[product(1,{status:'ACTIVE'})]});const result=await h.run();assert.equal(result.alreadyActive,1);assert.equal(h.writes.length,0);assert.equal(h.tags.length,0);
});
test('accepts an active priced range option and never updates unselected products',async()=>{
  const h=harness({rows:[product(1,{product_options:[{is_custom_value:true,is_active:true,selling_price:'105'}]}),product(2)]});assert.deepEqual((await h.run()).activated,[id(1)]);assert.equal(h.writes.length,1);
});
