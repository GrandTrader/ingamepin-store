const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const base = process.env.CART_TEST_URL || 'http://localhost:43000';
const item = (id, option, quantity = 1) => ({cartId:id,productId:'p',productOptionId:option,productName:'Cart regression '+id,categorySlug:'test',amount:100,quantity,unitPrice:2,totalPrice:quantity*2,minQuantity:1,isBulkOrder:true});
(async () => {
 const browser = await chromium.launch({headless:true, ...(process.env.CHROME_PATH ? {executablePath:process.env.CHROME_PATH} : {})});
 try {
 for (const viewport of [{width:1280,height:900},{width:390,height:844}]) {
  const context = await browser.newContext({viewport});const page = await context.newPage();
  await context.addInitScript(items => {localStorage.setItem('shoppingCart',JSON.stringify(items));}, [item('a','o'),item('b','o',2)]);
  let delay = 0, available = 500, requests = 0;
  await page.route('**/api/customer-discounts',r=>r.fulfill({json:{discounts:{}}}));
  await page.route('**/api/products/quantity-limits',async r=>{
    requests++; const stock = available; const wait = delay;
    if(wait) await new Promise(resolve=>setTimeout(resolve,wait));
    await r.fulfill({json:{limits:[{productId:'p',productOptionId:'o',minimumQuantity:1,maximumQuantity:null,availableQuantity:stock}]}}).catch(()=>{});
  });
  await page.goto(base+'/cart',{waitUntil:'domcontentloaded',timeout:90000});
  const input=page.getByRole('textbox',{name:'Enter quantity for Cart regression a'});
  await input.waitFor();await page.waitForTimeout(1000);
  assert.equal(await input.inputValue(),'1');
  delay=2000;const before=requests;
  await input.fill('');assert.equal(await input.inputValue(),'');
  await input.pressSequentially('125',{delay:15});
  assert.equal(await input.inputValue(),'125');
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('shoppingCart'))[0].quantity),125);
  await input.blur();await page.waitForTimeout(600);
  assert.ok(requests-before<=1,'typing should be batched into one stock check');
  const plus=page.getByRole('button',{name:'Increase quantity',exact:true}).first();
  const began=Date.now();for(let i=0;i<5;i++)await plus.click();
  assert.equal(await input.inputValue(),'130');assert.ok(Date.now()-began<2000,'clicks must not wait for stock response');
  await input.fill('');await input.blur();assert.equal(await input.inputValue(),'130');
  await input.fill('0');await input.blur();assert.equal(await input.inputValue(),'1');
  await input.fill('499');await input.blur();assert.equal(await input.inputValue(),'1','combined stock of duplicate lines must be enforced');
  // The server reports less stock than the initial snapshot: checkout must re-check.
  available=0;delay=100;await page.getByRole('button',{name:'Proceed to Checkout',exact:true}).click();
  await page.waitForTimeout(500);assert.equal(new URL(page.url()).pathname,'/cart');
  assert.match(await page.locator('main [role=alert]').innerText(),/Only 0/);
  assert.equal(await page.evaluate(()=>localStorage.getItem('checkoutCart')),null);
  // Old failed responses cannot overwrite newer quantity changes or resurrect removed items.
  delay=1200;available=0;await input.fill('2');await input.blur();await page.waitForTimeout(500);
  available=500;await input.fill('3');await input.blur();await page.waitForTimeout(2000);
  assert.equal(await page.locator('main [role=alert]').count(),0);
  await plus.click();await page.waitForTimeout(500);await page.getByRole('button',{name:'Remove',exact:true}).first().click();
  await page.waitForTimeout(1500);assert.equal(await page.locator('article').count(),1);
  await page.screenshot({path:'output/cart-diagnostic/cart-'+viewport.width+'.png',fullPage:true});
  console.log('PASS '+viewport.width+': clear/replace, rapid clicks, batched requests, duplicate stock, checkout stock, stale responses, removal');
  await context.close();
 }
 } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
