/* eslint-disable @typescript-eslint/no-require-imports */
// Exercise the actual upload component with mocked server actions; no live writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=process.cwd(),out=path.join(root,'tmp/bulk-price-import-ui');fs.mkdirSync(out,{recursive:true});
const write=(name,text)=>fs.writeFileSync(path.join(out,name),text);
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const expiry=new Date(Date.now()+86400000).toISOString();
const snapshot={product:{id:id(1),name:'Test Xbox game',price:100,currency:'USD',status:'ACTIVE',updated_at:'2026-01-01T00:00:00Z'},options:[{id:id(2),option_name:'Standard Edition',selling_price:100,is_custom_value:false,is_active:true,catalog_source:null,updated_at:'2026-01-01T00:00:00Z'}],promotion:null,range_options:[],seller_managed:false};
write('ts-loader.cjs',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;`);
write('price-actions.js',`const {buildPricePlan}=require(${JSON.stringify(path.join(root,'lib/bulk-price-import.ts'))});
exports.previewPriceImport=async({csv})=>{const p=buildPricePlan(csv,${JSON.stringify({[id(1)]:snapshot})});return {rows:p.preview,errors:p.errors,productCount:p.plan.length,digest:'test-digest'}};
exports.startPriceImport=async()=>{window.applyCount=(window.applyCount||0)+1;return {id:'test-run',count:1}};
exports.exportExistingPrices=async()=>({csv:'product_id,option_id',count:1});`);
write('actions.js',`exports.catalogHistory=async()=>({runs:window.finished?[{id:'test-run',filename:'prices.csv',created_at:new Date().toISOString(),status:'COMPLETED',settings:{mode:'prices'}}]:[]});
exports.processCatalogBatch=async(id,offset,undo)=>{window.finished=true;window.undone=undo;return {next:1,count:1,results:[{sku:'Test Xbox game',status:undo?'UNDONE':'UPDATED'}]}};
exports.catalogRunDetails=async()=>({changes:[{sku:'Test Xbox game',status:'UPDATED',fields:[{field:'Standard Edition price',before:'100',after:'120'}]}]});`);
write('entry.js',`const React=require('react'),{createRoot}=require('react-dom/client');const Form=require(${JSON.stringify(path.join(root,'app/admin/products/bulk-import/PriceImportForm.tsx'))}).default;createRoot(document.getElementById('app')).render(React.createElement(Form,{ready:!location.search.includes('not-ready')}));`);
(async()=>{
 const {webpack}=require('next/dist/compiled/webpack/webpack-lib');
 await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,entry:path.join(out,'entry.js'),output:{path:out,filename:'bundle.js'},module:{rules:[{test:/\.tsx?$/,use:path.join(out,'ts-loader.cjs')}]},resolve:{extensions:['.tsx','.ts','.js'],alias:{[path.join(root,'app/admin/products/bulk-import/price-actions')]:path.join(out,'price-actions.js'),[path.join(root,'app/admin/products/bulk-import/actions')]:path.join(out,'actions.js'),'@':root}}},(e,s)=>e||s.hasErrors()?reject(e||Error(s.toString({all:false,errors:true}))):resolve()));
 const css=fs.readdirSync('.next/static/chunks').filter(f=>f.endsWith('.css')).map(f=>fs.readFileSync('.next/static/chunks/'+f,'utf8')).join('\n');
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?fs.readFileSync(path.join(out,'bundle.js')):'<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style></head><body><main id="app" style="max-width:1100px;margin:auto;padding:16px;min-width:0"></main><script src="/bundle.js"></script></body></html>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const {chromium}=require('C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const base='http://127.0.0.1:'+server.address().port;
  await page.goto(base);const input=page.getByLabel('Price update CSV'),preview=page.getByRole('button',{name:'Preview price changes'}),apply=page.getByRole('button',{name:'Apply these price and discount updates'});
  const csv=(price,percent,end)=>'product_id,option_id,regular_price_usd,discount_percent,discount_expires_at\n'+[id(1),id(2),price,percent,end].join(',');
  const upload=async content=>{await input.setInputFiles({name:'prices.csv',mimeType:'text/csv',buffer:Buffer.from(content)});await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(b=>b.textContent==='Preview price changes'&&!b.disabled));};
  assert.equal(await preview.isDisabled(),true);
  await upload(csv(120,25,expiry));await preview.click();await page.getByText('Review 1 options across 1 products',{exact:true}).waitFor();
  const row=page.getByRole('row').nth(1);await row.getByText('$100.00',{exact:true}).waitFor();await row.getByText('$120.00',{exact:true}).waitFor();await row.getByText('$90.00',{exact:true}).waitFor();await row.getByText(/IST/).waitFor();
  assert.equal(await page.evaluate(()=>window.applyCount||0),0,'Preview never applies changes');
  for(const width of [1280,390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'No page overflow at '+width);await page.screenshot({path:path.join(out,'preview-'+width+'.png'),fullPage:true});}
  await upload(csv(120,25,'2000-01-01 00:00'));assert.equal(await apply.count(),0,'Changing file clears old preview');await preview.click();await page.getByRole('alert').getByText(/future/).waitFor();assert.equal(await apply.count(),0);assert.equal(await page.evaluate(()=>window.applyCount||0),0);
  await upload(csv(120,25,expiry));await preview.click();await apply.click();await page.getByRole('status').getByText('Prices, discounts and expiry dates updated successfully.',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>window.applyCount),1);
  await page.getByRole('button',{name:'View changes'}).click();await page.getByText('Test Xbox game · UPDATED',{exact:true}).waitFor();
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Undo update'}).click();await page.getByRole('status').getByText(/Undo finished/).waitFor();assert.equal(await page.evaluate(()=>window.undone),true);
  await page.goto(base+'/?not-ready');assert.equal(await page.getByLabel('Price update CSV').isDisabled(),true);
  assert.deepEqual(errors,[]);console.log('PASS: real bulk price upload, CSV validation, preview without writes, explicit apply, history/undo and desktop/mobile layouts.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
