// Render the real history component with synthetic invoices and codes only.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),ts=require('typescript');
const out=path.join(process.cwd(),'tmp/digiseller-log-ui');fs.mkdirSync(out,{recursive:true});
const compile=file=>ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;
fs.writeFileSync(path.join(out,'Collapsible.js'),compile('components/CollapsibleAdminSection.tsx'));
fs.writeFileSync(path.join(out,'Mapping.js'),compile('app/admin/products/[id]/edit/stock/DigiSellerMapping.tsx').replaceAll('"@/components/CollapsibleAdminSection"','"./Collapsible"').replaceAll('"./digiseller-actions"','"./mapping-actions"'));
fs.writeFileSync(path.join(out,'mapping-actions.js'),"exports.loadDigiSellerMappingProducts=async()=>{window.mappingLoads=(window.mappingLoads||0)+1;return{products:[{id:6204670,name:'Apple India',stock:10,visible:true,price:1,currency:'USD'},{id:6204001,name:'Another product',stock:10,visible:true,price:1,currency:'USD'}]}};exports.createDigiSellerProduct=async()=>{};exports.saveDigiSellerMapping=async()=>{};");
fs.writeFileSync(path.join(out,'Log.js'),ts.transpileModule(fs.readFileSync('components/DigiSellerOrderLog.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);
fs.writeFileSync(path.join(out,'Log.js'),fs.readFileSync(path.join(out,'Log.js'),'utf8').replaceAll('"@/components/CollapsibleAdminSection"','"./Collapsible"'));
fs.writeFileSync(path.join(out,'entry.js'),"const React=require('react'),{createRoot}=require('react-dom/client'),Log=require('./Log').default,Mapping=require('./Mapping').default;createRoot(document.getElementById('app')).render(React.createElement('main',{className:'mx-auto max-w-5xl p-3 sm:p-6'},React.createElement('h1',{className:'text-xl font-black'},'Edit product · DigiSeller'),React.createElement(Log,{productId:'11111111-1111-4111-8111-111111111111',deliveredOnly:location.search.includes('sold')}),React.createElement(Mapping,{productId:'11111111-1111-4111-8111-111111111111',options:[{id:'option-1',name:'100 INR',digisellerProductId:6204670,digisellerOptionId:10,digisellerVariantId:11}]})));");
(async()=>{
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',devtool:false,entry:path.join(out,'entry.js'),output:{path:out,filename:'bundle.js'}},(err,stats)=>err||stats.hasErrors()?reject(err||Error(stats.toString({all:false,errors:true}))):resolve()));
 const css=fs.readdirSync('.next/static',{recursive:true}).filter(p=>p.endsWith('.css')).map(p=>fs.readFileSync(path.join('.next/static',p),'utf8')).join('\n');
 const html='<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'body{margin:0;font-family:Arial;background:#f8fafc;color:#0f172a}</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>';
 const requests=[];
 const server=http.createServer((req,res)=>{
  if(req.url.endsWith('/variants')){res.setHeader('Content-Type','application/json');res.end(JSON.stringify({variants:[{optionId:10,variantId:11,name:'100 INR'},{optionId:10,variantId:12,name:'200 INR'}]}));return;}
  if(req.url.startsWith('/api/')){
   const q=new URL(req.url,'http://fixture.test').searchParams;requests.push(Object.fromEntries(q));
   res.setHeader('Content-Type','application/json');
   if(q.get('source')){res.end(JSON.stringify({goods:'TEST-VOUCHER-100\n<img src=x onerror="window.bad=true">'}));return;}
   if(q.get('invoice')==='999'){res.statusCode=500;res.end(JSON.stringify({error:'Unable to load DigiSeller history. Please retry.'}));return;}
   const row=(invoiceId,source,state,quantity,optionName)=>({invoiceId,digiProductId:'6204670',source,state,quantity,optionName,date:'2026-10-26T04:00:00Z'});
   let rows=q.get('before')?[row('100','stock','DELIVERED',1,'100 INR')]:[row('200','stock','DELIVERED',1,'100 INR'),row('199','definiteplay','DELIVERED',100,'Apple Gift Card 2000 INR'),row('198','fkwallet','WAITING',2,'Mobile Legends 500 Diamonds')];
   if(q.get('delivered'))rows=rows.filter(r=>r.state==='DELIVERED');
   if(q.get('invoice'))rows=rows.filter(r=>r.invoiceId===q.get('invoice'));
   res.end(JSON.stringify({rows,next:q.get('before')||q.get('invoice')?null:'198'}));return;
  }
  res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?fs.readFileSync(path.join(out,'bundle.js')):html);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  for(const width of [1440,390,320]){
   requests.length=0;const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:'+server.address().port);
   const logSummary=page.locator('summary[aria-label="DigiSeller orders log"]'),mappingSummary=page.locator('summary[aria-label="Match denominations"]');
   await logSummary.waitFor();await mappingSummary.waitFor();
   assert.equal(await page.locator('details[open]').count(),0,'Both sections start collapsed');
   assert.equal(requests.length,0,'Closed log does not request orders');
   assert.equal(await page.evaluate(()=>window.mappingLoads||0),0,'Closed mapping does not load catalogue');
   await page.screenshot({path:path.join(out,'collapsed-'+width+'.png'),fullPage:true});
   await mappingSummary.click();
   const productSelect=page.getByLabel('DigiSeller product for 100 INR',{exact:true}),variantSelect=page.getByLabel('DigiSeller variant for 100 INR',{exact:true});
   await variantSelect.waitFor();assert.equal(await productSelect.inputValue(),'6204670');assert.equal(await variantSelect.inputValue(),'10:11');
   await productSelect.selectOption('6204001');await variantSelect.selectOption('10:12');
   await page.getByLabel('Create a new hidden DigiSeller API product',{exact:true}).fill('https://my.digiseller.com/inside/new_description.asp?fixture=1');
   await mappingSummary.click();assert.equal(await productSelect.isVisible(),false);
   await mappingSummary.focus();await page.keyboard.press('Enter');
   assert.equal(await productSelect.inputValue(),'6204001');assert.equal(await variantSelect.inputValue(),'10:12');
   assert.match(await page.getByLabel('Create a new hidden DigiSeller API product',{exact:true}).inputValue(),/fixture=1/);
   assert.equal(await page.evaluate(()=>window.mappingLoads),1,'Reopening preserves the form and does not reload products');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mapping fits mobile');
   await page.screenshot({path:path.join(out,'mapping-'+width+'.png'),fullPage:true});
   await mappingSummary.click();
   await logSummary.click();
   await page.getByRole('heading',{name:'DigiSeller #200',exact:true}).waitFor();
   assert.equal(requests.filter(q=>q.source).length,0,'Code content must not load in list');
   assert.equal(await page.getByRole('button',{name:'View codes / delivery',exact:true}).count(),2,'Waiting deliveries cannot reveal content');
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await page.getByRole('button',{name:'View codes / delivery',exact:true}).first().click();
   await page.getByText('TEST-VOUCHER-100',{exact:false}).waitFor();
   assert.deepEqual(requests.find(q=>q.source),{invoice:'200',source:'stock'});
   assert.equal(await page.locator('article img').count(),0,'Code text cannot render HTML');
   assert.equal(await page.evaluate(()=>!!window.bad),false);
   await page.screenshot({path:path.join(out,'history-'+width+'.png'),fullPage:true});
   await page.getByRole('button',{name:'Hide delivered content'}).click();
   assert.equal(await page.getByText('TEST-VOUCHER-100',{exact:false}).count(),0);
   await page.getByRole('button',{name:'Next',exact:true}).click();
   await page.getByRole('heading',{name:'DigiSeller #100',exact:true}).waitFor();
   assert.equal(requests.at(-1).before,'198');assert.equal(await page.getByRole('button',{name:'Next',exact:true}).isDisabled(),true);
   await page.getByRole('button',{name:'Previous',exact:true}).click();
   await page.getByRole('heading',{name:'DigiSeller #200',exact:true}).waitFor();
   await page.getByLabel('DigiSeller order status',{exact:true}).selectOption('delivered');
   await page.getByRole('heading',{name:'DigiSeller #200',exact:true}).waitFor();
   assert.equal(requests.at(-1).delivered,'1');assert.equal(await page.getByText('Waiting',{exact:true}).count(),0);
   await page.getByLabel('DigiSeller invoice reference',{exact:true}).fill('199');
   await page.getByRole('button',{name:'Search',exact:true}).click();
   await page.getByRole('heading',{name:'DigiSeller #199',exact:true}).waitFor();
   assert.equal(await page.locator('article').count(),1);
   await page.getByLabel('DigiSeller invoice reference',{exact:true}).fill('999');await page.getByRole('button',{name:'Search',exact:true}).click();
   await page.getByRole('alert').waitFor();assert.equal(await page.locator('article').count(),0);
   await page.getByRole('button',{name:'Clear',exact:true}).click();await page.getByRole('heading',{name:'DigiSeller #200',exact:true}).waitFor();
   const countBeforeCollapse=requests.length;
   await page.getByLabel('DigiSeller invoice reference',{exact:true}).fill('unsubmitted draft');
   await logSummary.click();assert.equal(await page.getByRole('button',{name:'Refresh log',exact:true}).isVisible(),false);
   await logSummary.click();assert.equal(await page.getByLabel('DigiSeller invoice reference',{exact:true}).inputValue(),'unsubmitted draft');
   assert.equal(requests.length,countBeforeCollapse,'Reopening does not reset the log or fetch again');
   assert.deepEqual(errors,[]);await page.close();
   const sold=await browser.newPage({viewport:{width,height:1000}});await sold.goto('http://127.0.0.1:'+server.address().port+'/?sold');
   await sold.locator('summary[aria-label="DigiSeller sales"]').click();
   await sold.getByRole('heading',{name:'DigiSeller #200',exact:true}).waitFor();assert.equal(requests.at(-1).delivered,'1');
   assert.equal(await sold.getByLabel('DigiSeller order status',{exact:true}).count(),0);assert.equal(await sold.getByText('Waiting',{exact:true}).count(),0);
   assert.equal(await sold.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
   await sold.screenshot({path:path.join(out,'sold-'+width+'.png'),fullPage:true});await sold.close();
  }
  console.log('PASS: DigiSeller history and sold views at 1440/390/320px, on-demand codes, escaped content, filtering, pagination, error handling and no page overflow.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});
