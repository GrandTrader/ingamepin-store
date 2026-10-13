// Render actual components with isolated actions; never submit a real purchase.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),ts=require('typescript');
const out=path.join(process.cwd(),'tmp/fkwallet-delivery-ui');fs.mkdirSync(out,{recursive:true});
const write=(file,text)=>fs.writeFileSync(path.join(out,file),text);
for(const name of ['FKWalletSupplierPanel','FKWalletDeliveryControl'])write(name+'.js',ts.transpileModule(fs.readFileSync('app/admin/products/[id]/edit/supplier/'+name+'.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);
write('Link.js',`module.exports=({children,...props})=>require('react').createElement('a',props,children);`);
write('router.js',`exports.useRouter=()=>({refresh(){}});`);
write('actions.js',`exports.configureFKDelivery=async(...args)=>{window.calls.push(args);return window.failAction?{error:'The delivery service is unavailable.'}:{success:true}};`);
write('entry.js',`const React=require('react'),root=require('react-dom/client').createRoot(document.getElementById('app')),Panel=require('./FKWalletSupplierPanel').default;window.calls=[];window.preview={productId:'test-product',enabled:false,imported:{markup_percent:6,exchange_rate:88},options:[{id:'option',option_name:'Telegram Premium for 3 months',selling_price:13.35}],links:[{optionId:'option',supplierId:9,name:'Telegram Premium 3 months',cost:1108,currency:'RUB'}],delivery:{ready:false,deliveryKind:'CODE'}};window.renderPreview=update=>{window.preview={...window.preview,...update};root.render(React.createElement('main',{className:'mx-auto max-w-4xl p-4'},React.createElement(Panel,window.preview)))};window.renderPreview({});`);
(async()=>{
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',devtool:false,entry:path.join(out,'entry.js'),resolve:{alias:{'next/link':path.join(out,'Link.js'),'next/navigation':path.join(out,'router.js'),'@/app/admin/fkwallet/delivery-actions':path.join(out,'actions.js')}},output:{path:out,filename:'bundle.js'}},(error,stats)=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));
 const css=fs.readdirSync('.next/static',{recursive:true}).filter(p=>p.endsWith('.css')).map(p=>fs.readFileSync(path.join('.next/static',p),'utf8')).join('\n');
 const html='<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'body{margin:0;font-family:Arial;background:#fff}</style><div id="app"></div><script src="/bundle.js"></script>';
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?fs.readFileSync(path.join(out,'bundle.js')):html)});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const {chromium}=require('C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');const browser=await chromium.launch({channel:'chrome',headless:true});
 try{for(const width of [1280,390]){
  const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port);
  const enable=page.getByRole('button',{name:'Enable FKWallet automatic delivery'});await enable.waitFor();assert(await enable.isDisabled());assert.equal((await page.evaluate(()=>window.calls)).length,0);
  await page.evaluate(()=>window.renderPreview({delivery:{ready:true,deliveryKind:'CODE'}}));await enable.waitFor();await page.getByLabel('Delivery method').selectOption('ACCOUNT');await enable.click();await page.getByRole('status').filter({hasText:'Automatic delivery enabled'}).waitFor();
  assert.deepEqual(await page.evaluate(()=>window.calls),[['test-product',true,'ACCOUNT']]);
  await page.evaluate(()=>window.renderPreview({enabled:true}));await page.getByRole('button',{name:'Disable FKWallet automatic delivery'}).click();await page.getByRole('status').filter({hasText:'Automatic delivery disabled'}).waitFor();
  assert.deepEqual((await page.evaluate(()=>window.calls))[1],['test-product',false,'ACCOUNT']);
  await page.evaluate(()=>{window.failAction=true;window.renderPreview({enabled:false})});await enable.click();await page.getByRole('status').filter({hasText:'unavailable'}).waitFor();
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1));assert.deepEqual(errors,[]);
  await page.screenshot({path:path.join(out,'delivery-'+width+'.png'),fullPage:true});await page.close();
 }console.log('PASS: desktop/mobile delivery selection, blocked activation before readiness, activation/disable requests, visible errors and no overflow');}
 finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
