// Exercise the actual responsive panel with isolated server actions; no live product changes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),ts=require('typescript');
const out=path.join(process.cwd(),'tmp/supplier-switch-ui');fs.mkdirSync(out,{recursive:true});
const write=(file,text)=>fs.writeFileSync(path.join(out,file),text);
for(const [file,source] of [['Panel.js','app/admin/products/[id]/edit/supplier/SupplierSwitchPanel.tsx'],['types.js','lib/supplier-switch.ts']])write(file,ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);
write('router.js',`exports.useRouter=()=>({refresh(){window.calls.push(['refresh'])}});`);
write('switch-actions.js',`
const initial={provider:'DEFINITEPLAY',version:'v1',markup:'10',exchangeRate:'1',selection:null,options:[{id:'old',name:'PUBG 60 UC',denomination:'1',currency:'USD',active:true},{id:'hidden',name:'PUBG 325 UC',denomination:'5',currency:'USD',active:true}]};
exports.loadSupplierSwitch=async()=>{window.calls.push(['load']);return {data:window.tryFixture?{...initial,provider:'OWNED',options:[{id:'try2000',name:'2000 TRY',denomination:'2000',currency:'TRY',active:true}]}:initial}};
exports.loadSupplierCatalogFilters=async provider=>{window.calls.push(['categories',provider]);if(provider==='DEFINITEPLAY')await new Promise(resolve=>setTimeout(resolve,80));if(provider==='WUPEX'&&window.categoryFail)return {error:'Supplier filters unavailable'};return {data:{categories:provider==='FKWALLET'?[{id:'12',name:'Mobile games'}]:provider==='WUPEX'?[{id:'PUBG',name:'PUBG Mobile'},{id:'Apple',name:'Apple'}]:[{id:'Definite Play games',name:'Definite Play games'}],regions:provider==='FKWALLET'?[]:provider==='WUPEX'?['Global','Turkey']:['Global','India']}}};
exports.searchSupplierDenominations=async(provider,query,category,region,page)=>{window.calls.push(['search',provider,page,query,category,region]);return {data:{items:window.tryFixture?[{key:'11317',name:'Apple Gift Card 2000 TRY (Türkiye)',cost:'40.718681',costCurrency:'USD',region:'Turkiye',denomination:'2000',currency:'TRY',kind:'CODE'}]:[{key:'801',name:'PUBG Mobile 60 UC Global Digital Voucher',cost:'1.00',costCurrency:'USD',region:'Global',denomination:'1',currency:'USD',kind:'CODE'}],categories:[],total:25}}};
exports.previewSupplierSwitch=async(productId,selection)=>{window.calls.push(['preview',selection]);return {data:{token:'test-token',version:'v1',selection,options:selection.options.map(o=>({...o,cost:'1.00',costCurrency:'USD',price:(1+Number(selection.markup)/100).toFixed(2)})),hiddenCount:1,recipientFields:[]}}};
exports.applySupplierSwitch=async(...args)=>{window.calls.push(['apply',...args]);return window.failSave?{error:'Resolve unfinished website orders before switching or syncing denominations'}:{success:true,message:'Supplier and denominations saved.'}};
`);
write('entry.js',`const React=require('react'),root=require('react-dom/client').createRoot(document.getElementById('app')),Panel=require('./Panel').default;window.calls=[];root.render(React.createElement('main',{className:'mx-auto max-w-4xl p-4'},React.createElement(Panel,{productId:'test-product',currentSupplier:'DEFINITEPLAY'})));`);
(async()=>{
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',devtool:false,entry:path.join(out,'entry.js'),resolve:{alias:{'next/navigation':path.join(out,'router.js'),'@/lib/supplier-switch':path.join(out,'types.js')}},output:{path:out,filename:'bundle.js'}},(error,stats)=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));
 const css=fs.readdirSync('.next/static',{recursive:true}).filter(p=>p.endsWith('.css')).map(p=>fs.readFileSync(path.join('.next/static',p),'utf8')).join('\n');
 const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'body{margin:0;font-family:Arial;background:#f8fafc}</style><div id="app"></div><script src="/bundle.js"></script>';
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?fs.readFileSync(path.join(out,'bundle.js')):html)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const {chromium}=require('C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const width of [1280,390,320]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port);
  await page.getByRole('button',{name:'Change supplier',exact:true}).waitFor();assert.deepEqual(await page.evaluate(()=>window.calls),[]);
  await page.evaluate(()=>window.categoryFail=true);
  await page.getByRole('button',{name:'Change supplier',exact:true}).click();await page.getByLabel('Supplier',{exact:true}).selectOption('WUPEX');
  await page.getByRole('alert').filter({hasText:'Supplier filters unavailable'}).waitFor();
  assert(await page.getByLabel('Supplier region').isDisabled());
  await page.evaluate(()=>window.categoryFail=false);await page.getByRole('button',{name:'Retry filters'}).click();
  await page.getByLabel('Supplier category').selectOption('PUBG');
  await page.getByLabel('Supplier region').selectOption('Global');
  await page.getByLabel('Search supplier products').fill('PUBG');await page.getByRole('button',{name:'Load supplier products'}).click();await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'Next',exact:true}).click();
  const search=await page.evaluate(()=>window.calls.filter(c=>c[0]==='search').at(-1));assert.deepEqual(search,['search','WUPEX',2,'PUBG','PUBG','Global']);
  assert.equal(await page.getByLabel('Supplier category').inputValue(),'PUBG');
  assert.deepEqual(await page.getByLabel('Supplier region').locator('option').allTextContents(),['All regions','Global','Turkey']);
  await page.getByLabel('Supplier region').selectOption('Turkey');assert.equal(await page.getByRole('checkbox').count(),0);
  assert(await page.getByText('Selected denominations (1)',{exact:true}).isVisible());
  await page.getByRole('button',{name:'Load supplier products'}).click();
  assert.deepEqual(await page.evaluate(()=>window.calls.filter(c=>c[0]==='search').at(-1)),['search','WUPEX',1,'PUBG','PUBG','Turkey']);
  await page.getByLabel('Supplier region').selectOption('');await page.getByRole('button',{name:'Load supplier products'}).click();
  assert.equal((await page.evaluate(()=>window.calls.filter(c=>c[0]==='search').at(-1)))[5],'');
  await page.getByLabel('Supplier region').selectOption('Global');
  await page.getByLabel('Supplier category').selectOption('Apple');assert.equal(await page.getByRole('checkbox').count(),0);
  assert(await page.getByText('Selected denominations (1)',{exact:true}).isVisible());
  await page.getByLabel('Supplier category').selectOption('PUBG');await page.getByRole('button',{name:'Load supplier products'}).click();
  assert.equal((await page.evaluate(()=>window.calls.filter(c=>c[0]==='search').at(-1)))[2],1);
  await page.getByLabel('Match PUBG Mobile 60 UC Global Digital Voucher').selectOption('old');
  const preview=page.getByRole('button',{name:'Preview denominations & prices'});await preview.click();
  await page.getByRole('region',{name:'Supplier change preview'}).waitFor();assert.equal((await page.evaluate(()=>window.calls.filter(c=>c[0]==='apply'))).length,0);
  assert(await page.getByText('$1.10',{exact:true}).isVisible());
  await page.screenshot({path:path.join(out,'supplier-'+width+'.png'),fullPage:true});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));
  await page.getByLabel('Supplier markup').fill('20');assert.equal(await page.getByRole('button',{name:'Confirm supplier switch'}).count(),0);await preview.click();assert(await page.getByText('$1.20',{exact:true}).isVisible());
  await page.evaluate(()=>window.failSave=true);await page.getByRole('button',{name:'Confirm supplier switch'}).click();await page.getByRole('alert').filter({hasText:'unfinished website orders'}).waitFor();
  await page.evaluate(()=>window.failSave=false);await page.getByRole('button',{name:'Confirm supplier switch'}).click();await page.getByRole('status').filter({hasText:'Supplier and denominations saved.'}).waitFor();
  const attempts=await page.evaluate(()=>window.calls.filter(c=>c[0]==='apply'));assert.equal(attempts.length,2);assert.equal(attempts[0][2],attempts[1][2]);assert.equal(attempts[1][3].selection.options[0].optionId,'old');
  await page.getByRole('button',{name:'Change supplier',exact:true}).click();
  await page.getByLabel('Supplier',{exact:true}).selectOption('DEFINITEPLAY');await page.getByLabel('Supplier category').selectOption('Definite Play games');
  assert.deepEqual(await page.getByLabel('Supplier region').locator('option').allTextContents(),['All regions','Global','India']);
  assert.equal(await page.getByLabel('Supplier region').inputValue(),'');
  await page.getByLabel('Supplier',{exact:true}).selectOption('FKWALLET');await page.getByLabel('Supplier category').selectOption('12');
  assert.equal(await page.getByLabel('Supplier region').count(),0);
  assert.deepEqual(errors,[]);await page.getByRole('button',{name:'Close',exact:true}).click();assert.equal(await page.getByLabel('Supplier',{exact:true}).count(),0);await page.close();
 }
 for(const width of [1280,390,320]){
  const page=await browser.newPage({viewport:{width,height:1000}});
  await page.goto('http://127.0.0.1:'+server.address().port);await page.evaluate(()=>window.tryFixture=true);
  await page.getByRole('button',{name:'Change supplier',exact:true}).click();
  await page.getByLabel('Supplier category').selectOption('Apple');
  await page.getByRole('button',{name:'Load supplier products'}).click();await page.getByRole('checkbox').check();
  assert.equal(await page.getByLabel('Denomination for Apple Gift Card 2000 TRY (Türkiye)').inputValue(),'2000');
  assert.equal(await page.getByLabel('Currency for Apple Gift Card 2000 TRY (Türkiye)').inputValue(),'TRY');
  assert.equal(await page.getByLabel('Match Apple Gift Card 2000 TRY (Türkiye)').inputValue(),'try2000');
  await page.getByRole('button',{name:'Preview denominations & prices'}).click();
  await page.getByRole('region',{name:'Supplier change preview'}).waitFor();
  const selection=await page.evaluate(()=>window.calls.find(c=>c[0]==='preview')[1]);
  assert.equal(selection.options[0].optionId,'try2000');assert.equal(selection.options[0].currency,'TRY');
  assert.equal((await page.evaluate(()=>window.calls.filter(c=>c[0]==='apply'))).length,0);
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  await page.screenshot({path:path.join(out,'try-'+width+'.png'),fullPage:true});await page.close();
 }
 console.log('PASS: exact TRY denomination and uploaded-stock mapping; category and region dropdowns for all suppliers, retry, combined filters and pagination, selection preservation, price review and safe save; no mobile overflow or browser errors');}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
