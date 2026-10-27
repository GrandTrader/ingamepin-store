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
function actions(authorized=true){let calls=[],price='11',source='v1',configured=false,uploaded=[],missing=false;const draft=()=>({connection:'c',draft:{kind:'CODE',customerFields:[],options:[{name:'PUBG',denomination:'1',currency:'USD',supplierCost:'10',supplierCurrency:'USD',price}]}});
 const db={from(table){calls.push(table);return {select(){return this},eq(){return this},maybeSingle:async()=>({data:null}),then(resolve){resolve({data:[{id:'old'}]});}}},rpc:async(name)=>{calls.push(name);if(name==='product_supplier_version')return {data:source};if(name==='supplier_uploaded_options_to_keep')return missing?{error:{message:'missing'}}:{data:uploaded};configured=true;return {data:{productId:'product'}};}};
 const module=load('app/admin/products/[id]/edit/supplier/switch-actions.ts',{
  'next/cache':{revalidatePath:p=>calls.push('path:'+p),updateTag:t=>calls.push('tag:'+t)},
  '@/lib/wupex-admin':{requireWupexAdmin:async()=>{calls.push('auth');if(!authorized)throw new Error('unauthorized');return {db,userId:'admin'}}},
  '@/lib/wupex-import':{wupexUuid:()=>true},'@/lib/supplier-switch-catalogue':{supplierCatalogFilters:async provider=>{calls.push("categories:"+provider);return {categories:[{id:"PUBG",name:"PUBG"}],regions:["Global"]}},supplierCatalogue:async()=>{calls.push('catalogue');return {items:[]}},prepareSupplierConfiguration:async()=>draft()},
  '@/lib/supplier-switch-preview':tokens,'@/lib/supplier-switch':types,
  '@/lib/wupex-fulfillment':{syncWupexProduct:async()=>calls.push('stock-refresh')},'@/lib/wupex-storage':{requireWupexCredentials:async()=>({})},
  '@/lib/fkwallet-fulfillment':{syncFKProductStock:async()=>{}},'@/lib/fkwallet-storage':{requireCredentials:async()=>({})},'@/lib/definiteplay-relay':{getDefinitePlayItems:async()=>({items:[],stale:false})},
 });return {module,calls,changePrice:()=>price='12',setUploaded:value=>uploaded=value,missingMigration:()=>missing=true,configured:()=>configured};}
test('unauthorized users cannot search suppliers, preview, or save',async()=>{const f=actions(false);for(const [name,args] of [['loadSupplierCatalogFilters',['WUPEX']],['searchSupplierDenominations',['WUPEX','','','',1]],['previewSupplierSwitch',['product',selection]],['applySupplierSwitch',['product','request',{}]]])await assert.rejects(f.module[name](...args),/unauthorized/);assert.deepEqual(f.calls,['auth','auth','auth','auth']);});
test('changed supplier price prevents a save and preserves the current configuration',async()=>{const f=actions();const r=await f.module.previewSupplierSwitch('product',selection);assert(r.data);f.changePrice();const result=await f.module.applySupplierSwitch('product','request',r.data);assert.match(result.error,/prices or uploaded stock changed/);assert.equal(f.configured(),false);});
test('valid reviewed save uses the atomic RPC, then refreshes stock and storefront data',async()=>{const f=actions();const r=await f.module.previewSupplierSwitch('product',selection);const result=await f.module.applySupplierSwitch('product','request',r.data);assert.equal(result.success,true);assert.equal(f.configured(),true);assert(f.calls.indexOf('apply_product_supplier_configuration')<f.calls.indexOf('stock-refresh'));assert(f.calls.includes('tag:homepage-store-data'));});


test('catalogue filter loading checks administrator access and does not modify products',async()=>{
 const f=actions();const result=await f.module.loadSupplierCatalogFilters('WUPEX');
 assert.equal(result.data.categories[0].name,'PUBG');assert.deepEqual(f.calls,['auth','categories:WUPEX']);assert.equal(f.configured(),false);
});

test('category and region choices cover the full supplier catalogue and search forwards combined filters with pagination',async()=>{
 const calls=[];
 const catalogue=load('lib/supplier-switch-catalogue.ts',{
  '@/lib/supabase/admin':{},'./supplier-switch':types,
  './definiteplay-relay':{getDefinitePlayCatalogue:async(...args)=>{calls.push(['dp',...args]);return {items:[],categories:['Apple','PUBG'],regions:['Global','India'],total:0,stale:false};}},
  './definiteplay-import':{}, './wupex-storage':{requireWupexCredentials:async()=>({merchantCode:'fixture'})},
  './wupex-api':{getWupexCatalog:async(...args)=>{calls.push(['wx-search',...args.slice(1)]);return {products:[{id:11317,name:'Apple Gift Card 2000 TRY (Türkiye)',price:40.718681,faceValue:40.71851899,region:'Turkiye',cardType:'voucher'}],totalCount:25};}},
  './wupex-catalog-filters':{getCachedWupexCatalogFilters:async()=>{calls.push(['wx-categories']);return {categories:['Apple','PUBG'],regions:['Global','Turkey']};}},
  './wupex-import':load('lib/wupex-import.ts',{'./fkwallet-import':load('lib/fkwallet-import.ts')}),'./wupex-fulfillment':{},'./fkwallet-storage':{requireCredentials:async()=>({})},
  './fkwallet-api':{fkRequest:async(_,endpoint)=>{calls.push(['fk',endpoint]);return [{id:12,name:'Games'}];},parseCategories:rows=>rows},'./fkwallet-import':{},
 });
 for(const provider of ['WUPEX','DEFINITEPLAY']){
  const filters=await catalogue.supplierCatalogFilters(provider);
  assert.deepEqual(Array.from(filters.categories,c=>c.name),['Apple','PUBG']);
  assert.deepEqual(Array.from(filters.regions),provider==='WUPEX'?['Global','Turkey']:['Global','India']);
 }
 const fkFilters=await catalogue.supplierCatalogFilters('FKWALLET');
 assert.deepEqual(Array.from(fkFilters.categories,c=>c.id),['12']);assert.equal(fkFilters.regions.length,0);
 assert(calls.some(c=>c[0]==='dp'&&c[1]===''&&c[2]===0&&c[3]===1));
 await assert.rejects(catalogue.supplierCatalogFilters('OTHER'),/valid supplier/);
 const result=await catalogue.supplierCatalogue('WUPEX','60 UC','PUBG','Global',2);
 assert.equal(result.total,25);assert.equal(result.items[0].denomination,'2000');assert.equal(result.items[0].currency,'TRY');assert.equal(result.items[0].costCurrency,'USD');
 types.validateSupplierSelection({...selection,options:[{...result.items[0],optionId:null}]});
 const args=calls.find(c=>c[0]==='wx-search');assert.equal(args[1],2);assert.equal(args[2],'60 UC');assert.equal(args[5].category,'PUBG');assert.equal(args[5].region,'Global');
});


test('exact value and currency preserve uploaded-stock links despite different supplier names',()=>{
 const item={key:'11317',name:'Apple Gift Card 2000 TRY (Türkiye)',denomination:'2000',currency:'TRY'};
 const existing=[{id:'owned-option',name:'2000 TRY',denomination:'2000',currency:'TRY',active:true}];
 assert.equal(types.matchingSupplierOption(item,existing,[]),'owned-option');
 assert.equal(types.matchingSupplierOption({...item,currency:'USD'},existing,[]),null);
 assert.equal(types.matchingSupplierOption({...item,denomination:''},existing,[]),null);
 assert.equal(types.matchingSupplierOption(item,existing,[{optionId:'owned-option'}]),null);
 assert.equal(types.matchingSupplierOption(item,[...existing,{...existing[0],id:'other'}],[]),null);
});


test('uploaded-only options are shown in the preview and are bound to its signed stock snapshot',async()=>{
 const f=actions();const local={optionId:'old',name:'10 TRY',denomination:'10',currency:'TRY',price:'0.26',quantity:17};
 f.setUploaded([local]);const r=await f.module.previewSupplierSwitch('product',selection);assert(r.data);
 assert.equal(r.data.hiddenCount,0);assert.equal(r.data.uploadedOptions[0].quantity,17);assert.equal(f.configured(),false);
 f.setUploaded([{...local,quantity:16}]);const result=await f.module.applySupplierSwitch('product','request',r.data);
 assert.match(result.error,/Preview denominations again/);assert.equal(f.configured(),false);
});
test('missing uploaded-only migration blocks preparation without saving anything',async()=>{
 const f=actions();f.missingMigration();const r=await f.module.previewSupplierSwitch('product',selection);
 assert.match(r.error,/database update/);assert.equal(f.configured(),false);
});

 test('Wupex Turkish lira names populate denomination and currency safely',()=>{
 const parser=load('lib/wupex-import.ts',{'./fkwallet-import':load('lib/fkwallet-import.ts')});
 for(const amount of [2500,3000,4000,5000]) {
  for(const label of [amount+' TL',amount+'TL','TL '+amount,amount+' tl',amount+' TRY',amount+' ₺']) {
   const result=parser.wupexCardDenomination({name:'PlayStation Gift Card '+label+' (Turkey)'});
   assert.equal(result?.denomination,String(amount));assert.equal(result?.currency,'TRY');
  }
 }
 for(const label of ['2500 TLX','2500 BTL','2500 TL2','2500-5000 TL','2500+500 TL','2500 TL 100 USD'])
  assert.equal(parser.wupexCardDenomination({name:'PlayStation Gift Card '+label+' (Turkey)'}),null);
});
