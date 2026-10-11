// Exercise the real slider with local fixtures; no database or customer data.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const ts = require('typescript');
const out = path.join(process.cwd(), 'tmp/hero-slider-ui');
const write = (file, value) => { const target = path.join(out, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, value); };
write('components/HeroSlider.js', ts.transpileModule(fs.readFileSync('components/HeroSlider.tsx', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
}).outputText);
const rawCss = fs.readFileSync('components/HeroSlider.module.css', 'utf8');
const classes = Object.fromEntries([...rawCss.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => [m[1], 'hero_' + m[1]]));
const css = rawCss.replace(/\.([a-zA-Z][\w-]*)/g, (_, name) => '.' + classes[name]).replace(/:global\(([^)]+)\)/g, '$1');
write('components/HeroSlider.module.css', 'module.exports={__esModule:true,default:' + JSON.stringify(classes) + '};');
write('link.js', "module.exports=({children,prefetch,...props})=>require('react').createElement('a',props,children);");
write('entry.js', `
const React=require('react'),{createRoot}=require('react-dom/client'),Slider=require('./components/HeroSlider').default;
const params=new URLSearchParams(location.search),root=createRoot(document.getElementById('app'));
const titles=['Grand Theft Auto VI','Apple iTunes Store Code India','PlayStation India Wallet','Xbox Game Pass'];
window.renderSlides=(count=4)=>root.render(React.createElement(Slider,{autoplayMs:2000,slides:Array.from({length:count},(_,i)=>({id:'slide-'+i,title:titles[i]||'Offer '+i,eyebrow:'',description:'',desktopImageUrl:params.has('real')?'/reference/'+i+'.webp':'/banner/'+i+'.svg',mobileImageUrl:i===0&&!params.has('real')?'/banner/mobile.svg':null,buttonText:'Buy Now',buttonUrl:'/offer/'+i}))}));
window.renderSlides(Number(params.get('count')??4));
`);

(async () => {
  await new Promise((resolve, reject) => require('next/dist/compiled/webpack/webpack').webpack({
    mode: 'development', devtool: false, entry: path.join(out, 'entry.js'), output: { path: out, filename: 'bundle.js' },
    module: { rules: [{ test: /\.css$/, type: 'javascript/auto' }] },
    resolve: { alias: { 'next/link': path.join(out, 'link.js'), '@/components/NavigationLink': path.join(out, 'link.js') } },
  }, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  const builtCss = fs.readdirSync('.next/static', { recursive: true }).filter(p => p.endsWith('.css')).map(p => fs.readFileSync(path.join('.next/static', p), 'utf8')).join('\n');
  const html = '<!doctype html><html data-store-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + builtCss + '\n' + css + '\nbody{margin:0;background:#f5f7fc;font-family:Arial,sans-serif}header{height:100px;background:white;border-bottom:1px solid #ddd;padding:30px;box-sizing:border-box}header strong{color:#00798a}main{min-width:0}footer{padding:30px;max-width:1220px;margin:auto}html[data-store-theme=dark] body{background:#0f172a}@media(max-width:639px){main{padding:12px 14px 0}header{height:68px;padding:20px}}</style></head><body><header><strong>iNgamePIN</strong> · Homepage slider preview</header><main id="app"></main><footer><button id="outside">Browse products</button></footer><script src="/bundle.js"></script></body></html>';
  const server = http.createServer((req, res) => {
    if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(fs.readFileSync(path.join(out, 'bundle.js'))); }
    if (/^\/reference\/\d\.webp$/.test(req.url)) { res.setHeader('Content-Type', 'image/webp'); return res.end(fs.readFileSync(path.join(out, req.url))); }
    if (req.url.startsWith('/banner/')) {
      const index = req.url.match(/\d/)?.[0] || '0';
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.end(`<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="700"><rect width="1920" height="700" fill="${['#172d56','#582b78','#087286','#26592e'][index]}"/><text x="160" y="340" fill="white" font-size="100">Featured offer ${Number(index)+1}</text><circle cx="1550" cy="350" r="200" fill="#ffffff22"/></svg>`);
    }
    res.setHeader('Content-Type', 'text/html'); res.end(html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const errors=[]; page.on('pageerror',error=>errors.push(error.message));
    const base = 'http://127.0.0.1:' + server.address().port;
    const active = () => page.locator('[data-position="active"]');
    const index = () => active().getAttribute('aria-label');
    const settle = () => page.evaluate(() => Promise.all(document.getAnimations().map(a => a.finished.catch(()=>{}))));
    const open = async (query='') => { await page.goto(base+'/'+query); if (!query.includes('count=0')) await active().waitFor(); };
    await open();
    await page.waitForFunction(()=>document.querySelector('[data-playing="true"]'));
    await page.waitForFunction(()=>document.querySelector('[data-position="active"]').getAttribute('aria-label')==='2 of 4');
    await page.locator('.hero_stage').hover();
    const hovered = await index();
    await page.waitForTimeout(2200);
    assert.equal(await index(),hovered,'Autoplay pauses while hovering');
    await page.getByRole('button',{name:'Open slide 1',exact:true}).click();
    await page.mouse.move(10,10);
    await page.waitForTimeout(2200);
    assert.equal(await index(),'1 of 4','Keyboard focus pauses autoplay');
    await page.getByRole('button',{name:'Previous slide',exact:true}).click();
    assert.equal(await index(),'4 of 4','Previous wraps');
    await page.getByRole('button',{name:'Next slide',exact:true}).click();
    assert.equal(await index(),'1 of 4','Next wraps');
    await page.getByRole('button',{name:'Open slide 3',exact:true}).click();
    assert.equal(await index(),'3 of 4');
    await page.keyboard.press('Home'); assert.equal(await index(),'1 of 4');
    await page.keyboard.press('End'); assert.equal(await index(),'4 of 4');
    await page.keyboard.press('ArrowRight'); assert.equal(await index(),'1 of 4');
    await page.getByRole('button',{name:'Pause slideshow',exact:true}).click();
    await page.locator('#outside').click(); await page.mouse.move(10,10); await page.waitForTimeout(2200);
    assert.equal(await index(),'1 of 4','Manual pause persists after leaving the slider');
    await page.getByRole('button',{name:'Play slideshow',exact:true}).click();
    await page.locator('#outside').click(); await page.mouse.move(10,10);
    await page.waitForFunction(()=>document.querySelector('[data-position="active"]').getAttribute('aria-label')==='2 of 4');
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.getByRole('button',{name:'Open slide 1',exact:true}).click();
    await page.locator('#outside').click(); await page.mouse.move(10,10); await page.waitForTimeout(2200);
    assert.equal(await index(),'1 of 4','Reduced motion disables autoplay');
    assert.equal(await page.getByRole('button',{name:'Pause slideshow',exact:true}).count(),0);
    const stage = await page.locator('.hero_stage').boundingBox();
    await page.mouse.click(stage.x+stage.width*.93,stage.y+20);
    assert.equal(await index(),'2 of 4','Side preview selects the offer');
    assert.equal(new URL(page.url()).pathname,'/','Side preview does not immediately navigate');
    await active().locator('a').click(); await page.waitForURL('**/offer/1');
    await open();
    const box=await page.locator('.hero_stage').boundingBox();
    await page.mouse.move(box.x+box.width*.7,box.y+box.height*.5); await page.mouse.down();
    await page.mouse.move(box.x+box.width*.3,box.y+box.height*.5,{steps:8}); await page.mouse.up();
    assert.equal(await index(),'2 of 4','Horizontal drag advances');
    assert.equal(new URL(page.url()).pathname,'/','Dragging cannot buy/open a product');
    await page.mouse.move(box.x+box.width*.5,box.y+box.height*.4); await page.mouse.down();
    await page.mouse.move(box.x+box.width*.5,box.y+box.height*.8,{steps:8}); await page.mouse.up();
    assert.equal(await index(),'2 of 4','Vertical movement does not change slides');
    await open('?count=2');
    assert.equal(await page.locator('[data-position="previous"]').count(),1);
    assert.equal(await page.locator('[data-position="next"]').count(),1);
    for(const expected of ['2 of 2','1 of 2','2 of 2','1 of 2']){await page.getByRole('button',{name:'Next slide',exact:true}).click();assert.equal(await index(),expected);}
    await page.evaluate(()=>window.renderSlides(1));
    await page.waitForFunction(()=>document.querySelector('[data-single="true"]'));
    assert.equal(await page.locator('.hero_controls,.hero_arrow').count(),0);
    await page.evaluate(()=>window.renderSlides(0));
    await page.waitForFunction(()=>!document.querySelector('[aria-roledescription="carousel"]'));
    await open();
    for(const width of [1920,1280,768,640,390,320]){
      await page.setViewportSize({width,height:800});
      for(const theme of ['light','dark']){
        await page.evaluate(theme=>document.documentElement.dataset.storeTheme=theme,theme);
        await settle();
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No overflow at '+width+' '+theme);
        const sizing=await active().evaluate(el=>({card:el.getBoundingClientRect().width,stage:el.parentElement.getBoundingClientRect().width,fit:getComputedStyle(el.querySelector('img')).objectFit}));
        assert(Math.abs(sizing.card/sizing.stage-(width<640?.86:.8))<.01,'Centre banner width at '+width);
        assert.equal(sizing.fit,'contain','Keep existing images undistorted');
      }
    }
    assert.match(await active().locator('img').evaluate(el=>el.currentSrc),/mobile.svg$/,'Mobile artwork supported');
    if(fs.existsSync(path.join(out,'reference/0.webp'))){
      await open('?real=1');
      for(const width of [1920,390]){
        await page.setViewportSize({width,height:width>600?680:600});
        await page.locator('img').evaluateAll(images=>Promise.all(images.map(img=>img.decode().catch(()=>{}))));
        await settle();
        await page.screenshot({path:path.join(out,'slider-'+width+'.png'),fullPage:true});
        await page.locator('.hero_root').screenshot({path:path.join(out,'slider-only-'+width+'.png')});
      }
    }
    const phone=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
    const touchPage=await phone.newPage();
    await touchPage.goto(base+'/'); await touchPage.locator('[data-position="active"]').waitFor();
    const touchStage=await touchPage.locator('.hero_stage').boundingBox();
    const cdp=await phone.newCDPSession(touchPage);
    const touchY=touchStage.y+touchStage.height/2;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touchStage.x+touchStage.width*.75,y:touchY}]});
    for(const part of [.65,.55,.45,.35]) await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchStage.x+touchStage.width*part,y:touchY}]});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    await touchPage.waitForFunction(()=>document.querySelector('[data-position="active"]').getAttribute('aria-label')==='2 of 4');
    assert.equal(new URL(touchPage.url()).pathname,'/','A phone swipe does not open the product');
    await phone.close();
    assert.deepEqual(errors,[]);
    console.log('PASS: autoplay and pauses, reduced motion, arrows and wraparound, indicators and keyboard, preview/product links, swipe/vertical gestures, 0/1/2/4 banners, responsive light/dark layouts and mobile artwork.');
    console.log('Screenshots: '+out);
  } finally { await browser.close(); server.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
