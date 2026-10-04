// Production Next server must already be running locally. All purchase API traffic uses fixtures.
const assert=require('node:assert/strict'), fs=require('node:fs');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const base=process.env.TEST_BASE_URL || 'http://127.0.0.1:3002';
assert(['127.0.0.1','localhost'].includes(new URL(base).hostname),'Local preview only');
const purchase={order_number:'IP20261004123456',status:'DELIVERED',total:10,currency:'USD',created_at:'2026-10-04T01:00:00Z'};
(async()=>{
 const browser=await chromium.launch({channel:'chrome',headless:true});fs.mkdirSync('tmp/security-ui',{recursive:true});
 try {
  for(const width of [320,390,1280]) {
   const context=await browser.newContext({viewport:{width,height:900},permissions:['clipboard-read','clipboard-write']});
   let verified=false,source='guest',sendCalls=0;
   await context.route('**/api/orders/**',async route=>{
    const request=route.request(),url=new URL(request.url());let data,status=200;
    if(url.pathname==='/api/orders/verification') {
      if(request.method()==='GET')data={verified,email:verified?'fixture@example.invalid':null,source};
      else if(request.method()==='DELETE'){verified=false;data={verified:false};}
      else {const input=request.postDataJSON();if(input.action==='send'){sendCalls++;data={sent:true,message:'Check your email for a six-digit code.',retryAfter:60};}else if(input.code==='123456'){verified=true;data={verified:true,email:'fixture@example.invalid',source};}else{status=400;data={error:'Invalid or expired code. Request a new code if needed.'};}}
    } else if(url.pathname==='/api/orders/lookup') {
      if(!verified){status=401;data={error:'Verify your email to view your purchases.',verificationRequired:true};}
      else if(request.method()==='GET')data={orders:[purchase],page:1,hasMore:false,email:'fixture@example.invalid',source};
      else data={order:{orderNumber:purchase.order_number,status:'DELIVERED',total:10,currency:'USD',orderedAt:purchase.created_at,paidAt:purchase.created_at,deliveredAt:purchase.created_at},items:[{productName:'Fixture gift card',optionName:'10 USD',quantity:1,codes:['TEST-ONLY-1234-5678'],region:'US'}]};
    } else throw Error('Unexpected purchase API '+url.pathname);
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
   });
   // Never create a real order, send an email or trigger other writes during this UI test.
   await context.route('**/api/**',async route=>{
     if(new URL(route.request().url()).pathname.startsWith('/api/orders/'))return route.fallback();
     if(route.request().method()!=='GET')return route.fulfill({status:200,contentType:'application/json',body:'{}'});
     return route.fallback();
   });
   const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(()=>{window.securityViolations=[];document.addEventListener('securitypolicyviolation',e=>window.securityViolations.push({directive:e.violatedDirective,uri:e.blockedURI}));});
   const response=await page.goto(base+'/track-order');assert.equal(response.status(),200);assert.match(response.headers()['content-security-policy'],/nonce-/);
   await page.getByRole('button',{name:'Send verification code',exact:true}).waitFor();
   await page.getByLabel('Purchase email').fill('fixture@example.invalid');await page.getByRole('button',{name:'Send verification code',exact:true}).click();
   const code=page.getByLabel('Verification code', {exact:false});await code.fill('000000');await page.getByRole('button',{name:'Verify and view purchases'}).click();await page.getByRole('status').filter({hasText:'Invalid or expired'}).waitFor();
   await code.fill('123456');await page.getByRole('button',{name:'Verify and view purchases'}).click();
   await page.getByRole('button').filter({hasText:purchase.order_number}).click();await page.getByText('TEST-ONLY-1234-5678',{exact:true}).waitFor();
   await page.getByRole('button',{name:'Copy',exact:true}).click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'TEST-ONLY-1234-5678');
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),'No horizontal overflow at '+width);
   await page.screenshot({path:`tmp/security-ui/purchases-${width}.png`,fullPage:true});
   assert.equal((await page.evaluate(()=>window.securityViolations)).length,0,'No CSP violations on purchase page');assert.deepEqual(errors,[]);
   await page.getByRole('button',{name:'End session'}).click();await page.getByRole('button',{name:'Send verification code',exact:true}).waitFor();assert.equal(await page.getByText('TEST-ONLY-1234-5678',{exact:true}).count(),0);
   verified=true;source='account';await page.reload();await page.getByRole('button').filter({hasText:purchase.order_number}).waitFor();assert.equal(await page.getByRole('button',{name:'Send verification code',exact:true}).count(),0);assert.equal(sendCalls,1);
   console.log(`PASS ${width}px: OTP errors/success, purchase list, delivered-code copy, session logout, signed-in bypass, CSP and layout`);
   await context.close();
  }
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
