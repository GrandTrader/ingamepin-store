const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,console,URLSearchParams,Date,Map,Set,Intl,require:name=>{if(name in mocks)return mocks[name];if(name.startsWith('node:')||name.startsWith('react'))return require(name);throw Error('Unexpected dependency '+name);}});return exports;}
const filters=load('lib/admin-product-filters.ts');
const selection={q:'Apple',status:'ACTIVE',sort:'NAME_ASC',category:'apple',region:'India',kind:'BULK'};
const url=new URL(filters.adminProductPageUrl(2,selection),'http://localhost');
for(const [key,value] of Object.entries(selection))assert.equal(url.searchParams.get(key),value);
assert.equal(url.searchParams.get('page'),'2');assert(!filters.adminProductPageUrl(1,selection).includes('page='));
assert.equal(filters.matchesAdminProduct({category_id:'apple',region:'India',is_bulk_order:true},selection),true);
for(const change of [{category_id:'steam'},{region:'USA'},{is_bulk_order:false}])assert.equal(filters.matchesAdminProduct({category_id:'apple',region:'India',is_bulk_order:true,...change},selection),false);
assert(filters.matchesAdminProduct({category_id:null,region:null,is_bulk_order:false},{category:'',region:'Global',kind:'RETAIL'}));
let user=null,isAdmin=false,dbError=null,updates=[],invalidations=[];
const id='00000000-0000-4000-8000-000000000001';
const action=load('app/admin/products/channel-actions.ts',{
 'next/cache':{updateTag:tag=>invalidations.push(tag),revalidatePath:path=>invalidations.push(path)},
 '@/lib/supabase/admin-session':{createClient:async()=>({auth:{getUser:async()=>({data:{user}})},from:table=>{assert.equal(table,'admin_users');return {select(){return this},eq(){return this},maybeSingle:async()=>({data:isAdmin?{user_id:user.id}:null,error:null})}}})},
 '@/lib/supabase/admin':{createAdminClient:()=>({from:table=>{assert.equal(table,'products');return {update(value){updates.push(value);return this},eq(key,value){assert.equal(key,'id');assert.equal(value,id);return this},select(){return this},single:async()=>({data:dbError?null:{id},error:dbError})}}})}
});
(async()=>{
 assert((await action.setProductChannel(id,'business',false)).error);assert.equal(updates.length,0);
 user={id:'admin'};assert((await action.setProductChannel(id,'retail',false)).error);assert.equal(updates.length,0);
 isAdmin=true;
 for(const args of [['bad','retail',true],[id,'status',true],[id,'retail','false']])assert((await action.setProductChannel(...args)).error);
 assert.equal(updates.length,0);
 assert.equal((await action.setProductChannel(id,'business',false)).error,undefined);
 assert.equal(updates[0].business_enabled,false);assert.equal(updates[0].retail_enabled,undefined);
 assert.equal((await action.setProductChannel(id,'retail',true)).error,undefined);
 assert.equal(updates[1].retail_enabled,true);assert.equal(updates[1].business_enabled,undefined);
 assert(invalidations.includes('homepage-store-data'));assert(invalidations.includes('business-catalogue'));assert(invalidations.includes('/'));
 const count=invalidations.length;dbError={message:'Database unavailable'};assert((await action.setProductChannel(id,'business',true)).error);assert.equal(invalidations.length,count);
 console.log('PASS: combined category/region/type filtering, pagination preservation, admin-only channel changes, input validation, independent switches, failure reporting and cache invalidation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
