const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='server-only'?{}:n in mocks?mocks[n]:require(n),Buffer,process: {env:{SUPABASE_SECRET_KEY:'isolated-test-signing-key'}},Date,Set,...globals});return exports;}
const types=load('lib/supplier-switch.ts'),tokens=load('lib/supplier-switch-preview.ts');
const selection={provider:'WUPEX',query:'PUBG',category:'',region:'Global',markup:'10',exchangeRate:'1',deliveryKind:'CODE',options:[{key:'801',optionId:null,name:'PUBG 60',denomination:'1',currency:'USD'}]};
test('supplier selections reject duplicate IDs, unsupported providers and malformed values',()=>{
 assert.equal(types.validateSupplierSelection(selection),selection);
 for(const s of [{...selection,provider:'OTHER'},{...selection,markup:'1001'},{...selection,exchangeRate:'0'},{...selection,options:[]},{...selection,options:[...selection.options,...selection.options]},{...selection,options:[{...selection.options[0],denomination:'-1'}]}])assert.throws(()=>types.validateSupplierSelection(s));
 const id='00000000-0000-4000-8000-000000000001';assert.throws(()=>types.validateSupplierSelection({...selection,options:[{...selection.options[0],optionId:id},{...selection.options[0],key:'802',optionId:id}]}));
});
test('preview binds administrator, product, source version, prices and selection',()=>{
 const draft={price:'11',provider:'WUPEX'};const token=tokens.supplierPreviewToken('admin','product','version',draft,selection);
 assert(tokens.verifySupplierPreview(token,'admin','product','version',draft,selection));
 for(const args of [['other','product','version',draft,selection],['admin','other','version',draft,selection],['admin','product','new-version',draft,selection],['admin','product','version',{price:'1'},selection],['admin','product','version',draft,{...selection,provider:'DEFINITEPLAY'}]])assert.equal(tokens.verifySupplierPreview(token,...args),false);
 assert.equal(tokens.verifySupplierPreview(token+'x','admin','product','version',draft,selection),false);
 const expired=tokens.supplierPreviewToken('admin','product','version',draft,selection,Date.now()-1);
 assert.equal(tokens.verifySupplierPreview(expired,'admin','product','version',draft,selection),false);
});
function actions(authorized=true){let calls=[],price='11',source='v1',configured=false;const draft=()=>({connection:'c',draft:{customerFields:[],options:[{name:'PUBG',denomination:'1',currency:'USD',supplierCost:'10',supplierCurrency:'USD',price}]}});
 const db={from(table){calls.push(table);return {select(){return this},eq(){return this},maybeSingle:async()=>({data:null}),then(resolve){resolve({data:[{id:'old'}]});}}},rpc:async(name)=>{calls.push(name);if(name==='product_supplier_version')return {data:source};configured=true;return {data:{productId:'product'}};}};
 const module=load('app/admin/products/[id]/edit/supplier/switch-actions.ts',{
  'next/cache':{revalidatePath:p=>calls.push('path:'+p),updateTag:t=>calls.push('tag:'+t)},
  '@/lib/wupex-admin':{requireWupexAdmin:async()=>{calls.push('auth');if(!authorized)throw new Error('unauthorized');return {db,userId:'admin'}}},
  '@/lib/wupex-import':{wupexUuid:()=>true},'@/lib/supplier-switch-catalogue':{supplierCatalogue:async()=>{calls.push('catalogue');return {items:[]}},prepareSupplierConfiguration:async()=>draft()},
  '@/lib/supplier-switch-preview':tokens,'@/lib/supplier-switch':types,
  '@/lib/wupex-fulfillment':{syncWupexProduct:async()=>calls.push('stock-refresh')},'@/lib/wupex-storage':{requireWupexCredentials:async()=>({})},
  '@/lib/fkwallet-fulfillment':{syncFKProductStock:async()=>{}},'@/lib/fkwallet-storage':{requireCredentials:async()=>({})},'@/lib/definiteplay-relay':{getDefinitePlayItems:async()=>({items:[],stale:false})},
 });return {module,calls,changePrice:()=>price='12',configured:()=>configured};}
test('unauthorized users cannot search suppliers, preview, or save',async()=>{const f=actions(false);for(const [name,args] of [['searchSupplierDenominations',['WUPEX','','','',1]],['previewSupplierSwitch',['product',selection]],['applySupplierSwitch',['product','request',{}]]])await assert.rejects(f.module[name](...args),/unauthorized/);assert.deepEqual(f.calls,['auth','auth','auth']);});
test('changed supplier price prevents a save and preserves the current configuration',async()=>{const f=actions();const r=await f.module.previewSupplierSwitch('product',selection);assert(r.data);f.changePrice();const result=await f.module.applySupplierSwitch('product','request',r.data);assert.match(result.error,/prices changed/);assert.equal(f.configured(),false);});
test('valid reviewed save uses the atomic RPC, then refreshes stock and storefront data',async()=>{const f=actions();const r=await f.module.previewSupplierSwitch('product',selection);const result=await f.module.applySupplierSwitch('product','request',r.data);assert.equal(result.success,true);assert.equal(f.configured(),true);assert(f.calls.indexOf('apply_product_supplier_configuration')<f.calls.indexOf('stock-refresh'));assert(f.calls.includes('tag:homepage-store-data'));});
