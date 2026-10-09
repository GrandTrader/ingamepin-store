// Test the production build locally. Contact submissions are intercepted: no real messages are sent.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {spawn}=require('node:child_process');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const out=path.join(process.cwd(),'tmp/contact-pages-ui');fs.mkdirSync(out,{recursive:true});
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
  const socket=http.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
  const server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port',String(port)],{windowsHide:true,stdio:['ignore','pipe','pipe']});
  let logs='';server.stdout.on('data',data=>logs+=data);server.stderr.on('data',data=>logs+=data);
  let browser;
  try {
    const base=`http://127.0.0.1:${port}`;
    let ready=false;
    for(let i=0;i<60;i++){try{const response=await fetch(base+'/contact-us');if(response.ok){ready=true;break;}}catch{}await delay(500);}
    assert(ready,'Local server must start');
    browser=await chromium.launch({channel:'chrome',headless:true});
    const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],posts=[];
    page.on('pageerror',e=>errors.push(e.message));
    let responseMode='error',release;
    await page.route('**/*',async route=>{
      const request=route.request(),url=new URL(request.url());
      if(request.method()==='POST'&&url.pathname==='/api/support/chat'){
        posts.push(request.postDataJSON());
        if(responseMode==='hold')await new Promise(resolve=>release=resolve);
        if(responseMode==='error')return route.fulfill({status:503,json:{error:'Service unavailable. Please try again.'}});
        return route.fulfill({json:{conversation:{customer_email:'customer@example.com'},message:{id:'mock-message'}}});
      }
      // Block all other mutations, including third-party analytics, during this test.
      if(!['GET','HEAD'].includes(request.method()))return route.fulfill({status:200,json:{}});
      return route.continue();
    });
    await page.goto(base+'/contact-us');await page.getByRole('heading',{name:'Contact Us',exact:true}).waitFor();
    const form=page.locator('form').filter({has:page.locator('#contact-name')});
    await form.getByRole('button',{name:'Send message',exact:true}).click();assert.equal(posts.length,0,'Required fields block empty submission');
    await page.locator('#contact-name').fill('Test Customer');await page.locator('#contact-email').fill('customer@example.com');
    await page.locator('#contact-subject').fill('Delivery enquiry');await page.locator('#contact-order').fill('IGP12345');await page.locator('#contact-message').fill('Please check my order.');
    for(const theme of ['light','dark'])for(const width of [1440,768,390,320]){
      await page.setViewportSize({width,height:1000});await page.evaluate(theme=>document.documentElement.dataset.storeTheme=theme,theme);
      assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,`${theme} contact page overflow at ${width}`);
      assert(await page.locator('#contact-email').evaluate(el=>el.getBoundingClientRect().width>150),'Input remains usable');
      const channel=await page.locator('.support-channel span').first().evaluate(el=>{const style=getComputedStyle(el);return {color:style.color,fill:style.webkitTextFillColor};});
      assert.equal(channel.color,theme==='light'?'rgb(14, 116, 144)':'rgb(103, 232, 249)','Readable support link in '+theme);assert.equal(channel.fill,channel.color);
      await page.evaluate(()=>{document.activeElement?.blur();window.scrollTo(0,0);});
      if(width===1440||width===390)await page.screenshot({path:path.join(out,`contact-${theme}-${width}.png`),fullPage:true});
    }
    await form.getByRole('button',{name:'Send message',exact:true}).click();await form.getByRole('alert').waitFor();
    assert.equal(await page.locator('#contact-message').inputValue(),'Please check my order.','Failure preserves message');
    assert.equal(await form.getByRole('alert').evaluate(el=>el===document.activeElement),true,'Error receives keyboard focus');
    responseMode='hold';await form.getByRole('button',{name:'Send message',exact:true}).click();
    await form.getByRole('button',{name:'Sending…',exact:true}).waitFor();assert.equal(await form.getByRole('button',{name:'Sending…',exact:true}).isDisabled(),true);
    while(!release)await delay(10);release();await page.getByRole('heading',{name:'Message sent',exact:true}).waitFor();
    assert.equal(posts.length,2);assert.equal(posts[1].source,'contact');assert.equal(posts[1].orderNumber,'IGP12345');
    assert.match(await page.locator('[role="status"]').filter({hasText:'Message sent'}).innerText(),/customer@example.com/);
    await page.getByRole('button',{name:'Send another message'}).click();assert.equal(await page.locator('#contact-message').inputValue(),'');
    for(const [alias,target] of [['/support','/contact-us'],['/contact','/contact-us'],['/about','/about-us']]){
      await page.goto(base+alias);assert.equal(new URL(page.url()).pathname,target);
    }
    await page.goto(base+'/about-us');await page.getByRole('heading',{name:'About Us',exact:true}).waitFor();
    for(const width of [1440,390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'About page overflow '+width);}
    await page.setViewportSize({width:1440,height:1000});
    assert(await page.locator('footer a[href="/about-us"]').count()>0);assert(await page.locator('footer a[href="/contact-us"]').count()>0);
    await page.screenshot({path:path.join(out,'about-desktop.png'),fullPage:true});
    assert.deepEqual(errors,[]);console.log('PASS: public pages and redirects, footer links, desktop/mobile light/dark layouts, form validation, retained input on error, pending submission and success flow. No real messages sent.');
  } finally {
    if(browser)await browser.close();server.kill();fs.writeFileSync(path.join(out,'server.log'),logs);
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
