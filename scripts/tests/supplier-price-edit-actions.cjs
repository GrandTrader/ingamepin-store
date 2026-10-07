const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,FormData,Error,require:n=>{if(n in deps)return deps[n];throw Error('Unmocked '+n);}});return exports;}
const parser=load('lib/product-option-input.ts');
function harness({current=11,race=false,source='DEFINITEPLAY',admin=true}={}){
 const writes=[];const optionId='00000000-0000-4000-8000-000000000002',productId='00000000-0000-4000-8000-000000000001';
 function from(table){const filters=[];let op='read',payload;const chain={
  select(){return chain;},eq(k,v){filters.push([k,v]);return chain;},in(){return chain;},
  update(v){op='update';payload=v;return chain;},insert(v){op='insert';payload=v;return chain;},
  async maybeSingle(){return {data:table==='admin_users'?(admin?{user_id:'admin'}:null):{category_id:'category',stock_quantity:0,stock_source:source}};},
  then(resolve,reject){if(op!=='read'){writes.push({table,payload,filters});return Promise.resolve({data:race?[]:[{id:optionId}],error:null}).then(resolve,reject);}return Promise.resolve({data:table==='product_options'?[{id:optionId,selling_price:current,is_active:true}]:[],error:null}).then(resolve,reject);}
 };return chain;}
 const action=load('app/admin/products/[id]/edit/product-options/actions.ts',{'next/cache':{revalidatePath(){}},'next/navigation':{redirect:s=>{throw Error(s)}},'@/lib/supabase/admin':{createAdminClient:()=>({from})},'@/lib/supabase/admin-session':{createClient:async()=>({from,auth:{getUser:async()=>({data:{user:{id:'admin'}}})}})},'@/lib/product-stock':{isUnlimitedStock:()=>false,UNLIMITED_STOCK_QUANTITY:2147483647},'@/lib/product-option-input':parser}).saveProductOptions;
 const form=(selling=11,original=11,preserve=false)=>{const f=new FormData();f.set('id',productId);f.set('options',JSON.stringify([{id:optionId,name:'Apple',denomination:10,currency:'GBP',sellingPrice:selling,...(original===null?{}:{originalSellingPrice:original}),isActive:true,isInStock:true}]));if(preserve)f.set('preserve_discounted_prices','true');return f;};
 return {action,form,writes};
}
test('unchanged editor price never overwrites a newer supplier price',async()=>{const h=harness({current:12});await assert.rejects(h.action(h.form()),/success=/);assert.equal(h.writes.length,1);assert.equal(Object.hasOwn(h.writes[0].payload,'selling_price'),false);});
test('manual price edits use compare-and-save and preserve the new requested price',async()=>{const h=harness();await assert.rejects(h.action(h.form(13)),/success=/);assert.equal(h.writes[0].payload.selling_price,13);assert.ok(h.writes[0].filters.some(([k,v])=>k==='selling_price'&&v===11));});
test('changed catalogue rejects stale price edits before any writes',async()=>{const h=harness({current:12});await assert.rejects(h.action(h.form(13)),/Supplier%20prices%20changed/);assert.equal(h.writes.length,0);});
test('concurrent change between check and write reports a conflict',async()=>{const h=harness({race:true});await assert.rejects(h.action(h.form(13)),/This%20option%20changed/);});
test('protected customer discounts cannot use an outdated base price',async()=>{const h=harness({current:12});await assert.rejects(h.action(h.form(11,11,true)),/Supplier%20prices%20changed/);assert.equal(h.writes.length,0);});
test('old supplier editors must refresh and non-admin users cannot save',async()=>{const h=harness();await assert.rejects(h.action(h.form(12,null)),/Reload%20this%20editor/);assert.equal(h.writes.length,0);const denied=harness({admin:false});await assert.rejects(denied.action(denied.form()),/Access denied/);assert.equal(denied.writes.length,0);});
