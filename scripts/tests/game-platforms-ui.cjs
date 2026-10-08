const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict');
const ts = require('typescript');
const { webpack } = require('next/dist/compiled/webpack/webpack');
const postcss = require('postcss');
const { chromium } = require('C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = process.cwd(), dir = path.join(root, 'tmp/security-platforms');
fs.mkdirSync(dir, {recursive:true});
const transpile = source => ts.transpileModule(source, { compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true} }).outputText;
for (const [input, output] of [['lib/game-platforms.ts','platforms.js'],['components/ProductCategoryPlatforms.tsx','editor.js'],['components/ProductPlatformBadges.tsx','badges.js']]) {
  let source=fs.readFileSync(path.join(root,input),'utf8').replaceAll('@/lib/game-platforms','./platforms').replaceAll('./LocalizedProductText','./localized').replaceAll('./ProductPlatformBadges.module.css','./styles');
  fs.writeFileSync(path.join(dir,output),transpile(source));
}
fs.writeFileSync(path.join(dir,'localized.js'),'exports.__esModule=true;exports.default=({english})=>english;');
fs.writeFileSync(path.join(dir,'styles.js'),'module.exports={platforms:"platforms",cover:"cover",platform:"platform"};');
fs.writeFileSync(path.join(dir,'entry.js'),transpile(`
import React from 'react';
import {createRoot} from 'react-dom/client';
import Editor from './editor';
import Badges from './badges';
const categories=[{id:'games',name:'Games',slug:'games'},{id:'playstation-games',name:'PlayStation Games',slug:'playstation-games'},{id:'xbox-games',name:'Xbox Games',slug:'xbox-games'},{id:'xbox',name:'Xbox',slug:'xbox'},{id:'cards',name:'Gift Cards',slug:'gift-cards'}];
createRoot(document.getElementById('root')).render(<>
<div style={{padding:16,maxWidth:1152,margin:'auto'}}>
<h1 style={{fontSize:22,fontWeight:800,marginBottom:12}}>Product settings</h1>
<form id="editor"><Editor categories={categories} categoryId="games" platforms={['PS5','Steam']}><label>Region<select name="region" className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3"><option>Global</option></select></label></Editor></form>
</div>
<main className="page"><div className="container"><section className="panel compact">
<header className="heading"><div className="identity"><div className="categoryRow"><p className="category">Games</p><Badges platforms={['PS4','PS5','Xbox Series X|S','Steam','PC Only']}/></div><h1 className="title">Sample Game — Digital Edition</h1><div className="badges"><span className="badge">Global</span><span className="badge">Digital Delivery</span></div></div></header>
<div className="media"><div className="artwork platformArtwork"><div style={{aspectRatio:'1',background:'linear-gradient(140deg,#13203e,#2563eb)',color:'white',display:'grid',placeItems:'center',borderRadius:8,fontWeight:800}}>GAME</div><Badges platforms={['PS4','PS5','Xbox Series X|S','Steam','PC Only']} placement="cover"/></div></div>
</section></div></main></>);
`));
(async()=>{
  await new Promise((resolve,reject)=>webpack({mode:'production',entry:path.join(dir,'entry.js'),output:{path:dir,filename:'bundle.js'},optimization:{minimize:false}},(err,stats)=>err||stats.hasErrors()?reject(err||new Error(stats.toString({all:false,errors:true}))):resolve()));
  const tailwind=await postcss([require('@tailwindcss/postcss')({base:root})]).process('@import "tailwindcss";',{from:path.join(root,'platform-fixture.css')});
  const css=[tailwind.css,...['components/ProductPlatformBadges.module.css','app/product/[slug]/ProductPage.module.css'].map(f=>fs.readFileSync(f,'utf8').replace(/:global\(([^)]+)\)/g,'$1'))].join('\n');
  const html='<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><style>'+css+'</style><div id="root"></div><script src="/bundle.js"></script></html>';
  fs.writeFileSync(path.join(dir,'preview.html'),html.replace('/bundle.js','bundle.js'));
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?fs.readFileSync(path.join(dir,'bundle.js')):html)});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  try {
    const page=await browser.newPage(); const errors=[];page.on('pageerror',error=>{errors.push(error.message);console.error(error.message);});
    await page.goto('http://127.0.0.1:'+server.address().port);await page.getByRole('checkbox',{name:'Steam',exact:true}).waitFor();
    assert(await page.getByRole('checkbox',{name:'PS5',exact:true}).isChecked());
    await page.getByRole('checkbox',{name:'PS4',exact:true}).check();
    assert.deepEqual(await page.locator('#editor').evaluate(el=>new FormData(el).getAll('gaming_platforms')),['PS4','PS5','Steam']);
    await page.getByLabel('Category',{exact:true}).selectOption('cards');
    assert.equal(await page.getByRole('group',{name:'Gaming platforms'}).count(),0);
    assert.deepEqual(await page.locator('#editor').evaluate(el=>new FormData(el).getAll('gaming_platforms')),[]);
    await page.getByLabel('Category',{exact:true}).selectOption('games');
    assert(await page.getByRole('checkbox',{name:'PS4',exact:true}).isChecked());
    await page.getByLabel('Category',{exact:true}).selectOption('playstation-games');
    assert(await page.getByRole('checkbox',{name:'PS4',exact:true}).isChecked());
    assert(await page.getByRole('checkbox',{name:'PS5',exact:true}).isChecked());
    await page.getByLabel('Category',{exact:true}).selectOption('xbox-games');
    for(const platform of ['PS4','PS5','Steam']) await page.getByRole('checkbox',{name:platform,exact:true}).uncheck();
    for(const platform of ['Xbox One','Xbox Series X|S']) await page.getByRole('checkbox',{name:platform,exact:true}).check();
    assert.deepEqual(await page.locator('#editor').evaluate(el=>new FormData(el).getAll('gaming_platforms')),['Xbox One','Xbox Series X|S']);
    await page.getByLabel('Category',{exact:true}).selectOption('xbox');
    assert.deepEqual(await page.locator('#editor').evaluate(el=>new FormData(el).getAll('gaming_platforms')),['Xbox One','Xbox Series X|S']);
    for(const theme of ['light','dark']) for(const width of [320,390,1440]){
      await page.setViewportSize({width,height:1000});await page.evaluate(theme=>document.documentElement.dataset.storeTheme=theme,theme);
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Page must not overflow at '+width);
      assert.equal(await page.locator('.categoryRow .platform').count(),5);assert.equal(await page.locator('.artwork .platform').count(),5);
      const fits=await page.locator('.platform').evaluateAll(elements=>elements.every(el=>el.scrollWidth<=el.clientWidth));assert(fits,'Platform labels must fit');
      await page.screenshot({path:path.join(dir,`platforms-${theme}-${width}.png`),fullPage:true});
    }
    assert.deepEqual(errors,[]);console.log('Passed: checkbox selection, category switching, form values, both label positions, light/dark layouts at 320/390/1440px.');
  } finally {await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
