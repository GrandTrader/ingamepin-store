// Real Wupex UI with isolated mock actions. No supplier requests or credentials are used.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),ts=require('typescript');
const out=path.join(process.cwd(),'tmp/wupex-ui');fs.mkdirSync(out,{recursive:true});
const write=(file,text)=>fs.writeFileSync(path.join(out,file),text);
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
write('Panel.js',compile('app/admin/wupex/WupexPanel.tsx').replaceAll('"next/link"','"./Link"'));
write('Link.js',"const React=require('react');module.exports=({children,...props})=>React.createElement('a',props,children);");
write('actions.js',[
 "const delay=()=>new Promise(r=>setTimeout(r,200));",
 "exports.loadWupexDashboard=async()=>({databaseReady:true,connected:!!window.connected,configuredByEnvironment:false,baseUrl:window.connected?'https://fixture-service.wupex.com':null,sandbox:!window.connected,balance:window.connected?{amount:1250.75,currency:'USD'}:null,preorderEnabled:window.connected?true:null,errors:[]});",
 "exports.connectWupex=async form=>{window.calls.push({type:'connect',baseUrl:form.get('baseUrl')});await delay();window.connected=true;return{data:true};};",
 "exports.loadWupexProducts=async(page,query,kind,filters)=>{window.calls.push({type:'products',page,query,kind,filters});await delay();return{data:{products:[{id:page===1?101:102,sku:'APPLE-USA-4USD-LONG-SUPPLIER-REFERENCE-1234567890',name:page===1?'Apple Gift Card $4 (USA)':'Apple Gift Card $10 (USA)',price:4.1,available:page===1?250:0,cardType:'voucher',subType:null,region:'USA',faceValue:4}],page,pageSize:20,totalPages:2,totalCount:21}};};"
].join('\n'));
write('import-actions.js', "exports.listWupexImports=async()=>({data:[],total:0});");
write('Form.js',compile('app/admin/wupex/import/WupexImportForm.tsx').replaceAll('"next/link"','"./Link"').replaceAll('"../import-actions"','"./import-actions"').replaceAll('"@/lib/wupex-import"','"./wupex-import"'));
write('wupex-import.js',compile('lib/wupex-import.ts'));
write('fkwallet-import.js',compile('lib/fkwallet-import.ts'));
fs.appendFileSync(path.join(out,'import-actions.js'),"exports.importWupexProduct=async input=>{window.calls.push({type:'import',input});await new Promise(r=>setTimeout(r,100));return window.calls.filter(c=>c.type==='import').length===1?{error:'Test interrupted response. Retry the same draft.'}:{data:{productId:input.requestId}};};");

write('entry.js',"const React=require('react'),{createRoot}=require('react-dom/client'),Panel=require('./Panel').default,Form=require('./Form').default;window.calls=[];const setup={connection:'fixture',query:'Apple',catalogFilters:{category:'Apple Gift Card',region:'USA'},products:[{id:101,name:'Apple Gift Card $4 (USA)',sku:'APPLE4',price:4.1,faceValue:4,available:250,cardType:'voucher',subType:null,region:'USA',fields:[]}],categories:[{id:'22222222-2222-4222-8222-222222222222',name:'Gift cards'}]};createRoot(document.getElementById('app')).render(React.createElement('main',{className:'mx-auto max-w-5xl p-4 sm:p-8'},React.createElement('h1',{className:'mb-5 text-3xl font-black'},'Wupex'),location.search.includes('form')?React.createElement(Form,{setup}):React.createElement(Panel)));");
(async()=>{
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',devtool:false,entry:path.join(out,'entry.js'),output:{path:out,filename:'bundle.js'}},(err,stats)=>err||stats.hasErrors()?reject(err||Error(stats.toString({all:false,errors:true}))):resolve()));
 const css=fs.readdirSync('.next/static',{recursive:true}).filter(p=>p.endsWith('.css')).map(p=>fs.readFileSync(path.join('.next/static',p),'utf8')).join('\n');
 const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'body{margin:0;font-family:Arial;background:#f8fafc;color:#0f172a}</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>';
 const server=http.createServer((req,res)=>{if(req.url==='/api/admin/wupex/catalog-filters'){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({data:{categories:['Apple Gift Card','Steam'],regions:['India','USA']}}));return;}res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?fs.readFileSync(path.join(out,'bundle.js')):html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const width of [1440,390,320]){
   const page=await browser.newPage({viewport:{width,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port);
   await page.getByLabel('Environment').waitFor({timeout:8000}).catch(async e=>{console.error(errors);await page.screenshot({path:path.join(out,'failed.png'),fullPage:true});throw e;});
   assert.equal(await page.getByLabel('Service URL').inputValue(),'https://sandbox-service.wupex.com');
   assert.equal(await page.getByLabel('Service URL').getAttribute('readonly'),'');
   await page.getByLabel('Environment').selectOption('live');
   assert.equal(await page.getByLabel('Service URL').inputValue(),'');
   await page.getByLabel('Service URL').fill('https://fixture-service.wupex.com');
   await page.getByLabel('API key',{exact:true}).fill('fixture-not-real-key');
   await page.getByLabel('Merchant code').fill('fixture-merchant');
   assert.equal(await page.getByLabel('API key',{exact:true}).getAttribute('type'),'password');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.screenshot({path:path.join(out,'connection-'+width+'.png'),fullPage:true});
   await page.getByRole('button',{name:'Verify & save connection'}).click();
   await page.getByText('Connection verified and saved.',{exact:true}).waitFor();
   await page.getByText('Live connected',{exact:true}).waitFor();
   assert.equal(await page.locator('input[name="apiKey"]').inputValue(),'','Saved API key is cleared');
   await page.getByLabel('Search Wupex products').fill('Apple');
   await page.getByLabel('Product type',{exact:true}).selectOption('voucher');
   await page.getByLabel('Supplier category',{exact:true}).selectOption('Apple Gift Card');
   await page.getByLabel('Supplier region',{exact:true}).selectOption('USA');
   await page.getByRole('button',{name:'Load products'}).click();
   await page.getByText('Apple Gift Card $4 (USA)',{exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Previous',exact:true}).isDisabled(),true);
   await page.getByLabel('Select Apple Gift Card $4 (USA)').check();
   assert.match(await page.getByRole('link',{name:'Import selected (1)',exact:true}).getAttribute('href'),/ids=101&q=Apple/);
   const importLink=new URL(await page.getByRole('link',{name:'Import selected (1)',exact:true}).getAttribute('href'),'https://example.test');
   assert.equal(importLink.searchParams.get('category'),'Apple Gift Card');assert.equal(importLink.searchParams.get('region'),'USA');
   await page.getByLabel('Search Wupex products').fill('unapplied search');
   await page.getByLabel('Supplier category').selectOption('Steam');
   await page.getByLabel('Supplier region').selectOption('India');
   await page.getByRole('button',{name:'Next',exact:true}).click();
   await page.getByText('Apple Gift Card $10 (USA)',{exact:true}).waitFor();
   await page.getByText('Out of stock',{exact:true}).waitFor();
   const calls=await page.evaluate(()=>window.calls.filter(x=>x.type==='products'));
   assert.deepEqual(calls.map(c=>[c.page,c.query,c.kind,c.filters]),[[1,'Apple','voucher',{category:'Apple Gift Card',region:'USA'}],[2,'Apple','voucher',{category:'Apple Gift Card',region:'USA'}]]);
   assert.equal(await page.getByRole('button',{name:'Next',exact:true}).isDisabled(),true);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Catalogue fits the viewport');
   await page.screenshot({path:path.join(out,'catalogue-'+width+'.png'),fullPage:true});
   await page.getByRole('button',{name:'Reset filters',exact:true}).click();
   await page.getByText('Apple Gift Card $4 (USA)',{exact:true}).waitFor();
   assert.equal(await page.getByLabel('Supplier category').inputValue(),'');assert.equal(await page.getByLabel('Supplier region').inputValue(),'');
   assert.deepEqual(await page.evaluate(()=>window.calls.filter(x=>x.type==='products').at(-1)),{type:'products',page:1,query:'',kind:'',filters:{category:'',region:''}});
   assert.deepEqual(errors,[]);await page.close();

   const formPage=await browser.newPage({viewport:{width,height:1100}});
   const formErrors=[];formPage.on('pageerror',e=>formErrors.push(e.message));
   await formPage.goto('http://127.0.0.1:'+server.address().port+'/?form');
   await formPage.getByLabel('Product name',{exact:true}).waitFor();
   await formPage.getByLabel('Website category').selectOption('22222222-2222-4222-8222-222222222222');
   await formPage.getByLabel('Denomination currency').fill('USD');
   await formPage.getByLabel('Markup on supplier cost (%)').fill('10');
   await formPage.getByText('Sell: $4.51',{exact:true}).waitFor();
   assert.equal(await formPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Import fits mobile');
   await formPage.screenshot({path:path.join(out,'import-'+width+'.png'),fullPage:true});
   await formPage.getByRole('button',{name:'Create product draft',exact:true}).click();
   await formPage.getByRole('alert').waitFor();
   await formPage.getByRole('button',{name:'Create product draft',exact:true}).click();
   await formPage.getByText('Draft created',{exact:true}).waitFor();
   const saved=await formPage.evaluate(()=>window.calls.filter(c=>c.type==='import'));
   assert.equal(saved.length,2);assert.equal(saved[0].input.requestId,saved[1].input.requestId,'Lost reply retries preserve import identity');
   assert.equal(saved[1].input.markup,'10');assert.equal(saved[1].input.options[0].currency,'USD');
   assert.deepEqual(saved[1].input.catalogFilters,{category:'Apple Gift Card',region:'USA'});
   assert.equal(saved[1].input.options[0].expectedCost,'4.1');assert.deepEqual(formErrors,[]);await formPage.close();

  }
  console.log('Wupex browser checks passed: desktop/mobile layout, masked and cleared credentials, sandbox/live settings, filters, pagination and no overflow.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
