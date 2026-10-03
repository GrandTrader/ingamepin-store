const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),ts=require('typescript'),assert=require('node:assert/strict');
const out=path.resolve('tmp/approved-promoters-ui');fs.mkdirSync(out,{recursive:true});
for(const [file,name] of [['app/admin/affiliates/promoters/PromoterList.tsx','List.js'],['lib/affiliate-promoters.ts','logic.js']])fs.writeFileSync(path.join(out,name),ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText);
fs.writeFileSync(path.join(out,'actions.js'),'exports.savePromoterSettings=async form=>{window.saved=Object.fromEntries(form);};');
const accounts=Array.from({length:30},(_,i)=>({id:'account-'+i,affiliate_code:'IGP-'+i,status:'APPROVED',full_name:'Promoter '+i,email:'person'+i+'@example.com',country_code:'IN',promotion_channel:'WEBSITE',promotion_url:null,commission_override_percent:null,created_at:'2026-10-01T00:00:00Z'}));
fs.writeFileSync(path.join(out,'entry.js'),`const React=require('react');require('react-dom/client').createRoot(document.getElementById('app')).render(React.createElement(require('./List').default,{accounts:${JSON.stringify(accounts)},view:'approved'}));`);
(async()=>{
  const webpack=require('next/dist/compiled/webpack/webpack').webpack;
  await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,entry:path.join(out,'entry.js'),output:{path:out,filename:'bundle.js'},resolve:{alias:{'@/lib/affiliate-promoters':path.join(out,'logic.js')}}},(error,stats)=>error||stats.hasErrors()?reject(error||Error(stats.toString({all:false,errors:true}))):resolve()));
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?fs.readFileSync(path.join(out,'bundle.js')):'<html><meta name="viewport" content="width=device-width, initial-scale=1"><div id="app"></div><script src="/bundle.js"></script></html>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const {chromium}=require('C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
  try {
    const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto('http://127.0.0.1:'+server.address().port);
    await page.getByRole('button',{name:'Save Promoter'}).first().waitFor();assert.equal(await page.locator('form').count(),25);
    await page.getByRole('button',{name:'Next',exact:true}).click();assert.equal(await page.locator('form').count(),5);
    await page.getByRole('searchbox',{name:'Search by email'}).fill(' PERSON29@EXAMPLE.COM ');assert.equal(await page.locator('form').count(),1);assert.match(await page.getByRole('status').innerText(),/1 of 30/);
    await page.getByLabel('Status',{exact:true}).selectOption('SUSPENDED');await page.locator('input[name="commission_override_percent"]').fill('2.25');await page.getByRole('button',{name:'Save Promoter'}).click();await page.waitForFunction(()=>window.saved);
    const saved=await page.evaluate(()=>window.saved);assert.equal(saved.affiliate_id,'account-29');assert.equal(saved.return_view,'approved');assert.equal(saved.status,'SUSPENDED');assert.equal(saved.commission_override_percent,'2.25');assert.equal(saved.search,' PERSON29@EXAMPLE.COM ');
    await page.getByRole('searchbox').fill('missing@nowhere.test');await page.getByText('No promoters match this email.').waitFor();assert.equal(await page.locator('form').count(),0);
    await page.getByRole('button',{name:'Clear search'}).click();assert.equal(await page.locator('form').count(),25);
    await page.setViewportSize({width:390,height:844});await page.getByRole('searchbox').fill('person0@');assert.equal(await page.locator('form').count(),1);assert.equal(errors.length,0,errors.join('\n'));
    console.log('PASS: instant email search across pages, case/space handling, management form payload, empty state and mobile interaction. No real accounts changed.');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
