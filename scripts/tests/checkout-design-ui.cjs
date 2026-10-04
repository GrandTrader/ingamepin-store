const fs=require('fs');
const base=process.env.TEST_BASE_URL || 'http://localhost:3002';
if(!['localhost','127.0.0.1'].includes(new URL(base).hostname))throw Error('Local fixture test only');
const {chromium}=require('C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{const b=await chromium.launch({channel:'chrome',headless:true});try{
 const p=await b.newPage({viewport:{width:1440,height:1050}});const errors=[];p.on('pageerror',e=>errors.push(e.message));let posted=null;
 await p.route('**/api/**',r=>r.request().method()==='GET'?r.continue():r.fulfill({status:400,json:{error:'Unexpected test request'}}));
 const pid='ca5fb330-f083-46fe-b27a-31a6d98af545';
 await p.route('**/api/products/quantity-limits',r=>r.fulfill({json:{limits:r.request().postDataJSON().items.map(i=>({...i,minimumQuantity:10,maximumQuantity:null,availableQuantity:100000,denominationCurrency:'INR'}))}}));
 await p.route('**/api/customer-discounts',r=>r.fulfill({json:{authenticated:true,email:'aman@example.com',discounts:{[pid]:2.25}}}));
 await p.route('**/api/wallet/balance',r=>r.fulfill({json:{authenticated:true,balance:687.61,currency:'USD'}}));
 await p.route('**/api/products/payment-restrictions',r=>r.fulfill({json:{allowedPaymentMethods:['WALLET','BINANCE_PAY','USDT_DIRECT','PALLY','FREEKASSA','UPI'],allowedUsdtNetworks:['TRC20']}}));
 await p.route('**/api/seller-cart-quote',r=>r.fulfill({json:{hasSellerProducts:false}}));
 await p.route('**/api/orders**',r=>{if(r.request().method()==='POST'){posted=r.request().postDataJSON();return r.fulfill({status:400,json:{error:'Preview check only — no order was placed.'}})}const u=new URL(r.request().url());return r.fulfill({json:{fee:Math.round(Number(u.searchParams.get('baseTotal')))/100}})});
 await p.addInitScript(({pid})=>{localStorage.setItem('checkoutCart',JSON.stringify([{id:'fixture-cart',productId:pid,productOptionId:'11111111-1111-4111-8111-111111111111',name:'Apple iTunes India Gift Card',denomination:100,denominationCurrency:'INR',price:1.25,quantity:1000,isBulkOrder:true}]));},{pid});
 await p.goto(base+'/checkout',{waitUntil:'domcontentloaded'});
 const checkout=p.locator('#checkout-form');await checkout.waitFor();await p.waitForFunction(()=>document.querySelector('input#email')?.value==='aman@example.com');
 await p.addStyleTag({content:'*,*::before,*::after{animation:none!important;transition:none!important}'});
 await p.locator('input[value="binance"]').check();assert(await p.locator('input[value="wallet"]').isDisabled());
 await checkout.getByRole('button',{name:/Continue to Payment/}).click();await checkout.getByRole('alert').filter({hasText:'Please accept'}).waitFor();assert.equal(posted,null);
 await checkout.getByText('Add an order note',{exact:false}).click();await p.locator('#orderNote').fill('Test delivery note');
 await checkout.getByRole('checkbox').first().check();await checkout.getByRole('button',{name:/Continue to Payment/}).click();await checkout.getByRole('alert').filter({hasText:'Preview check only'}).waitFor();
 assert.equal(posted.paymentMethod,'binance');assert.equal(posted.customer.orderNote,'Test delivery note');assert.equal(posted.items[0].quantity,1000);assert.equal(posted.customer.marketingConsent,false);
 await p.locator('input[value="pally"]').check();assert(await p.locator('input[value="pally"]').isChecked());await p.locator('input[value="binance"]').check();
 const q=checkout.getByRole('spinbutton');await checkout.getByRole('button',{name:/Increase quantity/}).click();assert.equal(await q.inputValue(),'1001');await checkout.getByRole('button',{name:/Reduce quantity/}).click();assert.equal(await q.inputValue(),'1000');
 await checkout.getByText('Add an order note',{exact:false}).click();
 for(const theme of ['light','dark'])for(const width of [1440,390,320]){
 await p.setViewportSize({width,height:1050});await p.evaluate(t=>document.documentElement.dataset.storeTheme=t,theme);
 assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`Overflow ${theme} ${width}`);
 await p.locator('main').last().screenshot({path:`tmp/security-ui/checkout-order-first-${theme}-${width}.png`});
 console.log(`PASS ${theme} ${width}px`);
 }
 await p.locator('#email').fill('different@example.invalid');assert.equal(await checkout.getByRole('checkbox').count(),1,'Marketing consent requires matching verified email');
 assert.deepEqual(errors,[]);console.log('PASS selection, wallet availability, quantities, terms, note, and mocked submission. No order created.');
}finally{await b.close()}})().catch(e=>{console.error(e.message);process.exit(1)});
