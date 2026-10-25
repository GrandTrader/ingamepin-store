const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,Error,Intl,require:n=>n==='server-only'?{}:n in deps?deps[n]:n==='react/jsx-runtime'?require(n):(()=>{throw Error(n)})()});return exports;}
const productId='84c8e8cd-7753-4cbc-b9c6-844f51e48779';
const imported={product_id:productId,supplier_category_id:2,markup_percent:6,exchange_rate:88};
const options=[3,6,12].map((months,index)=>({id:'option'+index,option_name:`Telegram Premium for ${months} months`,selling_price:[13.35,17.79,32.26][index],denomination:1,denomination_currency:'USD'}));
const links=options.map((option,index)=>({optionId:option.id,supplierId:9+index,name:option.option_name,cost:[1108,1477,2678][index],currency:'RUB'}));
const Link=({children,...props})=>React.createElement('a',props,children);
const panel=load('app/admin/products/[id]/edit/supplier/FKWalletSupplierPanel.tsx',{'next/link':Link,'./FKWalletDeliveryControl':()=>React.createElement('p',null,'FKWallet setup pending')}).default;
function pageFixture({fk=true,denied=false,failed=false}={}){
 const calls=[];
 const session={from(table){calls.push(['read',table]);const chain={select(){return this},eq(){return this},maybeSingle:async()=>({data:{id:productId,name:'Telegram Premium 3/6/12 Months',slug:'fkwallet-'+productId,stock_source:'OWNED'}}),order:async()=>({data:options})};return chain;}};
 const page=load('app/admin/products/[id]/edit/supplier/page.tsx',{
  'next/link':Link,'next/navigation':{notFound(){throw Error('not found')}},
  '@/components/ProductSettingsActions':({children})=>React.createElement('div',null,children),
  '@/components/ProductEditPageTabs':()=>null,'../../../../AdminSidebar':()=>null,
  '@/lib/definiteplay-admin':{requireDefinitePlayAdmin:async()=>{calls.push(['auth']);if(denied)throw Error('denied');return session},validProductId:()=>true},
  '@/lib/wupex-product-supplier':{getWupexProductImport:async()=>null},
  '@/app/admin/wupex/WupexSupplierPanel':()=>React.createElement('p',null,'Wupex supplier'),
  '@/lib/fkwallet-product-supplier':{getFKWalletDeliveryState:async()=>({ready:false,deliveryKind:'CODE'}),getFKWalletProductImport:async()=>{calls.push(['fk-import']);if(failed)throw Error('Supplier lookup failed');return fk?imported:null},getFKWalletSavedLinks:async()=>{calls.push(['fk-links']);return links}},
  '@/lib/definiteplay-relay':{getDefinitePlayMappings:async()=>{calls.push(['definiteplay']);return {mappings:[]}}},
  '@/lib/definiteplay-fulfillment':{supplierDeliveryEnabled:()=>false},
  '@/lib/supabase/admin':{createAdminClient:()=>{throw Error('Unexpected supplier data request')}},
  './FKWalletSupplierPanel':panel,'./SupplierOptionEditor':()=>React.createElement('p',null,'Definite Play editor'),
  './SupplierDeliveryControl':()=>React.createElement('button',null,'Enable supplier stock and delivery'),
 }).default;
 return {page,calls};
}
test('FKWallet product displays all real mappings and never fetches or enables Definite Play',async()=>{
 const {page,calls}=pageFixture();const html=renderToStaticMarkup(await page({params:Promise.resolve({id:productId})}));
 assert.match(html,/3 of 3 options linked/);assert.match(html,/FKWallet catalogue/);assert.match(html,/href="\/admin\/fkwallet"/);
 assert.match(html,/Automatic customer delivery is not enabled/);assert.match(html,/6%/);assert.match(html,/88 RUB/);
 assert.match(html,/13.35/);assert.match(html,/17.79/);assert.match(html,/32.26/);
 for(const months of [3,6,12])assert.match(html,new RegExp('Telegram Premium for '+months+' months'));
 assert(!html.includes('Definite Play'));assert(!html.includes('Enable supplier stock and delivery'));assert(!calls.some(c=>c[0]==='definiteplay'));
 assert.equal(calls[0][0],'auth');
});
test('ordinary product keeps its existing supplier editor; failed authorization and lookup cannot show incorrect controls',async()=>{
 const ordinary=pageFixture({fk:false});const html=renderToStaticMarkup(await ordinary.page({params:Promise.resolve({id:productId})}));
 assert.match(html,/Link Definite Play products/);assert.match(html,/Enable supplier stock and delivery/);assert(ordinary.calls.some(c=>c[0]==='definiteplay'));
 const denied=pageFixture({denied:true});await assert.rejects(denied.page({params:Promise.resolve({id:productId})}),/denied/);assert.deepEqual(denied.calls,[['auth']]);
 const failed=pageFixture({failed:true});await assert.rejects(failed.page({params:Promise.resolve({id:productId})}),/Supplier lookup failed/);assert(!failed.calls.some(c=>c[0]==='definiteplay'));
});
test('an added, unmapped denomination is clearly identified instead of being marked linked',()=>{
 const html=renderToStaticMarkup(React.createElement(panel,{productId,imported,options,links:links.slice(0,2)}));
 assert.match(html,/2 of 3 options linked/);assert.match(html,/This option has no saved FKWallet link/);
});
test('supplier lookup recognizes manual drafts and fails closed on database errors',async()=>{
 let error=null,data=imported;
 const chain={select(){return this},eq(){return this},maybeSingle:async()=>({data,error}),then(resolve){resolve({data,error})}};
 const api=load('lib/fkwallet-product-supplier.ts',{'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>chain})}});
 assert.equal((await api.getFKWalletProductImport(productId)).product_id,productId);
 data=null;assert.equal(await api.getFKWalletProductImport(productId),null);
 error={code:'PGRST205'};assert.equal(await api.getFKWalletProductImport(productId),null);
 error={code:'CONNECTION_ERROR'};await assert.rejects(api.getFKWalletProductImport(productId),/could not be checked/);
 await assert.rejects(api.getFKWalletSavedLinks(productId),/could not be loaded/);
});
