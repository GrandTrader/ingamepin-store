const assert=require('node:assert/strict');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.STOREFRONT_TEST_URL||'http://127.0.0.1:3133';
async function waitFor(check,label){for(let i=0;i<150;i++){if(check())return;await new Promise(r=>setTimeout(r,100));}throw Error('Timed out: '+label);}
(async()=>{const browser=await chromium.launch({channel:'chrome',headless:true});try{
 for(const width of [1440,390]){
  const context=await browser.newContext({viewport:{width,height:1000},hasTouch:width===390});const page=await context.newPage();const errors=[];let requests=[],views=0;
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(r.url().includes('_rsc='))requests.push({path:new URL(r.url()).pathname,prefetch:r.headers()['next-router-prefetch']==='1'});if(new URL(r.url()).pathname==='/api/product-views')views++;});
  await page.addInitScript(({base})=>{if(location.origin!==base)return;sessionStorage.setItem('preorder-popup-closed','true');localStorage.setItem('storePreferencesManual','true');localStorage.setItem('storeLanguage','en');localStorage.setItem('storeCurrency','USD');},{base});
  await page.goto(base+'/category/apple-store-itunes');const link=page.locator('a:has(article.product-card-standard)').first();await link.waitFor();await link.scrollIntoViewIfNeeded();const target=new URL(await link.getAttribute('href'),base).pathname;
  // Do not hover: the visible product must be prepared automatically for mobile taps too.
  await waitFor(()=>requests.some(r=>r.path===target),'automatic visible product request');await page.waitForTimeout(3500);assert.equal(views,0,'Prefetch must not count as a product visit');
  requests=[];const start=Date.now();if(width===390)await link.tap();else await link.click();await page.getByRole('button',{name:'Buy Now',exact:true}).waitFor();const elapsed=Date.now()-start;assert(elapsed<1500,'Prepared product should not wait for reviews');
  assert(!requests.some(r=>r.path===target&&!r.prefetch),'Prepared product must open without a click-time page request');
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
  console.log(`PASS ${width}px: automatic full-page preparation, no click-time request, product ready in ${elapsed}ms.`);
  await page.goBack();await page.locator('article.product-card-standard').first().waitFor();assert(new URL(page.url()).pathname==='/category/apple-store-itunes');
  if(width===1440){
   const search=page.locator('input[role="combobox"]:visible');await search.fill('resident evil');await page.locator('[role="option"]:visible').first().waitFor();await search.press('ArrowDown');
   const option=page.locator('[role="option"][aria-selected="true"]:visible');const searchTarget=new URL(await option.getAttribute('href'),base).pathname;
   // Reviews can continue streaming after the purchase form is ready. Test the click, not the end of the reviews response.
   await page.waitForTimeout(3500);requests=[];const searchStart=Date.now();await search.press('Enter');await page.getByRole('button',{name:'Buy Now',exact:true}).waitFor();const searchMs=Date.now()-searchStart;
   assert(!requests.some(r=>r.path===searchTarget&&!r.prefetch));assert(searchMs<1500,'Prepared search product should not wait for reviews');console.log(`PASS keyboard search selection: purchase form ready in ${searchMs}ms with no click-time page request.`);
  }
  assert.deepEqual(errors,[]);await context.close();
 }
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
