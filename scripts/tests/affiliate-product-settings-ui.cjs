const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http'),ts=require('typescript');
const out=path.resolve('tmp/affiliate-products-ui');fs.mkdirSync(out,{recursive:true});
const data=[
  {id:'00000000-0000-4000-8000-000000000001',name:'Apple India',category_id:'apple',region:'IN',status:'ACTIVE',affiliate_enabled:false,affiliate_commission_percent:0},
  {id:'00000000-0000-4000-8000-000000000002',name:'Apple USA',category_id:'apple',region:'US',status:'ACTIVE',affiliate_enabled:false,affiliate_commission_percent:0},
  {id:'00000000-0000-4000-8000-000000000003',name:'Steam USA',category_id:'steam',region:'US',status:'ACTIVE',affiliate_enabled:true,affiliate_commission_percent:3},
  {id:'00000000-0000-4000-8000-000000000004',name:'Apple Old',category_id:'apple',region:'IN',status:'INACTIVE',affiliate_enabled:false,affiliate_commission_percent:0},
];
for(const [src,dest] of [['app/admin/affiliates/AffiliateProductsEditor.tsx','Editor.js'],['lib/affiliate-product-settings.ts','logic.js']]){
  fs.writeFileSync(path.join(out,dest),ts.transpileModule(fs.readFileSync(src,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText);
}
fs.writeFileSync(path.join(out,'actions.js'),`exports.saveDisplayedAffiliateProducts=async changes=>{window.saves=window.saves||[];window.saves.push(changes);if(window.failSave)return{ok:false,message:'Save failed; no changes saved.'};return{ok:true,message:'Saved changes to '+changes.length+' displayed products.'};};`);
fs.writeFileSync(path.join(out,'entry.js'),`const React=require('react');require('react-dom/client').createRoot(document.getElementById('app')).render(React.createElement(require('./Editor').default,{products:${JSON.stringify(data)},categories:[{id:'apple',name:'Apple'},{id:'steam',name:'Steam'}]}));`);
(async()=>{
  const webpack=require('next/dist/compiled/webpack/webpack').webpack;
  await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,entry:path.join(out,'entry.js'),output:{path:out,filename:'bundle.js'},resolve:{alias:{'@/lib/affiliate-product-settings':path.join(out,'logic.js')}}},(error,stats)=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?fs.readFileSync(path.join(out,'bundle.js')):'<html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="app"></div><script src="/bundle.js"></script></html>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const {chromium}=require('C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
  try{
    const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port);
    await page.getByRole('heading',{name:'Affiliate Products'}).waitFor();
    await page.getByLabel('Search products').fill('apple');
    await page.getByLabel('Region',{exact:true}).selectOption('IN');
    await page.getByLabel('Product status',{exact:true}).selectOption('ACTIVE');
    assert.equal(await page.locator('article').count(),1);
    await page.getByLabel('Maximum commission (%)',{exact:true}).first().fill('5');
    await page.getByLabel('Affiliate promotion',{exact:true}).selectOption('ENABLED');
    await page.getByRole('button',{name:'Apply to displayed',exact:true}).click();
    assert.equal(await page.getByLabel('Commission for Apple India',{exact:true}).inputValue(),'5');
    await page.getByRole('button',{name:'Save changes to 1 displayed products'}).click();
    await page.getByRole('status').filter({hasText:'Saved changes to 1'}).waitFor();
    assert.deepEqual(await page.evaluate(()=>window.saves[0]),[{id:data[0].id,enabled:true,commission:5}]);
    await page.getByRole('button',{name:'Clear filters'}).click();
    assert.equal(await page.getByLabel('Commission for Apple USA',{exact:true}).inputValue(),'0');
    assert.equal(await page.getByLabel('Commission for Steam USA',{exact:true}).inputValue(),'3');
    await page.getByLabel('Commission for Apple USA',{exact:true}).fill('7');
    await page.getByLabel('Enable Apple USA',{exact:true}).check();
    await page.getByLabel('Category',{exact:true}).selectOption('steam');
    await page.getByRole('button',{name:'Save changes to 1 displayed products'}).click();
    await page.waitForFunction(()=>window.saves.length===2);
    assert.equal((await page.evaluate(()=>window.saves[1]))[0].id,data[2].id,'Hidden draft must not be submitted');
    await page.getByRole('button',{name:'Clear filters'}).click();
    assert.equal(await page.getByLabel('Commission for Apple USA',{exact:true}).inputValue(),'7','Hidden edits survive filtering');
    await page.getByLabel('Search products').fill('missing');
    assert.equal(await page.getByRole('button',{name:'Save changes to 0 displayed products'}).isDisabled(),true);
    await page.getByRole('button',{name:'Clear filters'}).click();
    await page.getByLabel('Search products').fill('Apple USA');
    await page.evaluate(()=>window.failSave=true);
    await page.getByRole('button',{name:'Save changes to 1 displayed products'}).click();
    await page.getByRole('alert').filter({hasText:'Save failed'}).waitFor();
    assert.equal(await page.getByLabel('Commission for Apple USA',{exact:true}).inputValue(),'7');
    assert.deepEqual(errors,[]);
    console.log('PASS: browser filters, apply to displayed, exact save scope, hidden drafts, empty results and failed-save recovery.');
  } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
