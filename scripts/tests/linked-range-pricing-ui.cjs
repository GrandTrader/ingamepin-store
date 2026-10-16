// Actual editor components with local fixtures; no production writes or supplier calls.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const {webpack}=require('next/dist/compiled/webpack/webpack-lib');
const {chromium}=require('C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.cwd(),out=path.join(root,'tmp/linked-range-pricing-ui');fs.mkdirSync(out,{recursive:true});
const optionValues=[2,3,4,5,10,20,50,100];
const options=optionValues.map(value=>({id:'option-'+value,name:value+' USD',denomination:value,currency:'USD',sellingPrice:value*1.1,isActive:true,isInStock:true,supplierCost:value===10?9.81:value*.98}));
const range={product_id:'product',option_id:'range',enabled:true,currency:'USD',minimum:2,maximum:500,step:.01,price_basis:100,price_usd:105.84,delivery_mode:'SUPPLIER',supplier:'DEFINITEPLAY',supplier_reference:'TEST-USD',price_rounding:'UP'};
fs.writeFileSync(path.join(out,'loader.cjs'),`const ts=require('typescript');module.exports=source=>ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;`);
fs.writeFileSync(path.join(out,'action.cjs'),`exports.loadOpenValueProducts=async()=>({data:{items:[],ready:false,preview:true},error:''});`);
fs.writeFileSync(path.join(out,'entry.cjs'),`
 const React=require('react'),{createRoot}=require('react-dom/client');
 const Editor=require('../../app/admin/products/[id]/edit/product-options/LinkedRangeOptionEditor.tsx').default;
 const Options=require('../../app/admin/products/[id]/edit/product-options/ProductOptionsEditor.tsx').default;
 const manual=location.search.includes('manual');
 const saved=location.search.includes('saved');
 const options=${JSON.stringify(options)};
 const range=manual?{...${JSON.stringify(range)},delivery_mode:'MANUAL',price_usd:saved?1.1664:1.08,supplier:null,supplier_reference:null}:${JSON.stringify(range)};
 const pricing={linked:saved,manualBasePrice:manual&&saved?1.08:null,manualMarkup:manual&&saved?8:0};
 createRoot(document.getElementById('root')).render(React.createElement(React.Fragment,null,
 React.createElement('form',{onSubmit:e=>{e.preventDefault();window.saved=Object.fromEntries(new FormData(e.currentTarget));}},React.createElement('input',{type:'hidden',name:'id',value:'product'}),React.createElement(Editor,{range,ready:true,options,productCurrency:'USD',linkedPricing:pricing,initialMarkup:manual?null:{markup:8,discount:2},supplierFixedPricing:!manual})),
 React.createElement('details',null,React.createElement('summary',null,'Manage denominations'),React.createElement('form',null,React.createElement(Options,{productName:'Example',initialOptions:options,pricesReadOnly:true,linkedPricing:{range,supplierMarkup:manual?null:8,supplierFixed:!manual,costs:Object.fromEntries(options.map(o=>[o.id,o.supplierCost]))}})))));
`);
function cssFiles(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?cssFiles(path.join(folder,entry.name)):entry.name.endsWith('.css')?[path.join(folder,entry.name)]:[]);}
(async()=>{
 await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,entry:path.join(out,'entry.cjs'),output:{path:out,filename:'bundle.js'},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/app/admin/definiteplay/open-value-actions':path.join(out,'action.cjs'),'@':root}},module:{rules:[{test:/\.tsx?$/,exclude:/node_modules/,use:path.join(out,'loader.cjs')}]}},(e,s)=>e?reject(e):s.hasErrors()?reject(Error(s.toString({all:false,errors:true}))):resolve()));
 const css=cssFiles(path.join(root,'.next/static')).map(f=>fs.readFileSync(f,'utf8')).join('\n');
 const html=`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}body{margin:0;background:#f5f7fb}main{padding:12px;max-width:900px;margin:auto}</style></head><body><main><div id="root"></div></main><script src="/bundle.js"></script></body></html>`;
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?fs.readFileSync(path.join(out,'bundle.js')):html);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1440,height:1100}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const url=`http://127.0.0.1:${server.address().port}`;
  await page.goto(url);await page.getByLabel('Markup on supplier cost (%)').fill('5');
  await page.getByLabel('Card value (USD)').fill('100');assert.equal(await page.getByTestId('range-selling-price').textContent(),'$102.90');
  const row=page.getByRole('table').locator('tbody tr').filter({hasText:'10 USD'});
  assert.equal(await row.locator('td').last().textContent(),'$10.31');
  await page.getByLabel('Markup on supplier cost (%)').fill('8');assert.equal(await row.locator('td').last().textContent(),'$10.60');
  assert.equal(await page.getByTestId('range-selling-price').textContent(),'$105.84');
  await page.getByRole('button',{name:'Show all 8 denominations'}).click();assert.equal(await page.getByRole('table').locator('tbody tr').count(),8);
  await page.getByRole('button',{name:'Save all prices',exact:true}).click();
  assert.equal((await page.evaluate(()=>window.saved)).link_fixed_prices,'on');assert.equal((await page.evaluate(()=>window.saved)).markup_percent,'8');
  for(const width of [1440,390,320]){
   await page.setViewportSize({width,height:1100});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   await page.screenshot({path:path.join(out,`supplier-${width}.png`),fullPage:true});
  }
  await page.getByLabel('Markup on supplier cost (%)').fill('-1');assert(await page.getByRole('button',{name:'Save all prices',exact:true}).isDisabled());
  await page.goto(url+'/?manual');await page.getByLabel('Markup on base price (%)').fill('10');await page.getByLabel('Card value (USD)').fill('100');
  assert.equal(await page.getByTestId('range-selling-price').textContent(),'$1.19');
  await page.getByRole('button',{name:'Save all prices',exact:true}).click();const manualSaved=await page.evaluate(()=>window.saved);
  assert.equal(manualSaved.base_price_usd,'1.08');assert.equal(manualSaved.markup_percent,'10');assert.equal(manualSaved.delivery_mode,'MANUAL');
  await page.goto(url+'/?manual&saved');assert.equal(await page.getByLabel('Markup on base price (%)').inputValue(),'8');
  await page.getByLabel('Card value (USD)').fill('100');assert.equal(await page.getByTestId('range-selling-price').textContent(),'$1.17');
  await page.getByLabel('Markup on base price (%)').fill('10');assert.equal(await page.getByTestId('range-selling-price').textContent(),'$1.19','Reopening uses the saved base, not the previously marked-up rate');
  await page.getByText('Manage denominations',{exact:true}).click();assert.equal(await page.getByLabel('Price for 10 USD').getAttribute('readonly'),'');
  assert.equal(await page.getByRole('button',{name:'Apply to all prices'}).count(),0);
  await page.getByText('Manage denominations',{exact:true}).click();
  await page.screenshot({path:path.join(out,'manual-320.png'),fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('PASS: real mobile/desktop editor, one shared markup, supplier-specific costs, manual base persistence, single save payload, read-only fixed prices, validation, expandable preview, no overflow or browser errors.');
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});
