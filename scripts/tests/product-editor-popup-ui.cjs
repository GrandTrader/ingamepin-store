const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {spawn,spawnSync}=require('node:child_process');
const {chromium}=require('C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.cwd(), fixture=path.join(root,'tmp/security-product-editor'), screenshots=path.join(root,'tmp/security-ui');
fs.mkdirSync(screenshots,{recursive:true});
const write=(file,content)=>{const full=path.join(fixture,file);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,content);};
const tabs=[...fs.readFileSync('components/ProductEditPageTabs.tsx','utf8').matchAll(/\["([\w-]+)", "([^"]+)"\]/g)].map(m=>[m[1],m[2]]);
write('package.json',JSON.stringify({name:'isolated-product-editor-test',private:true}));
write('tsconfig.json',JSON.stringify({compilerOptions:{target:'ES2022',lib:['dom','esnext'],jsx:'react-jsx',module:'esnext',moduleResolution:'bundler',esModuleInterop:true,resolveJsonModule:true,skipLibCheck:true,paths:{'@/*':['../../*']}},include:['**/*.ts','**/*.tsx','.next/types/**/*.ts']}));
write('next.config.js',`module.exports={devIndicators:false,turbopack:{root:${JSON.stringify(root)}},experimental:{staleTimes:{dynamic:0,static:30}}};`);
write('postcss.config.mjs','export default {plugins:{"@tailwindcss/postcss":{}}};');
write('styles.css','@import "../../app/globals.css"; @source "../../components"; @source "../../app/admin"; @source "./";');
write('app/layout.tsx',`import '../styles.css';export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><body style={{background:'#f8fafc',color:'#17243a'}}>{children}</body></html>}`);
write('app/admin/products/layout.tsx',fs.readFileSync('app/admin/products/layout.tsx','utf8'));
write('app/admin/products/page.tsx',`import Link from '@/components/ProductEditorLink';import {cookies} from 'next/headers';export default async function Page(){const name=(await cookies()).get('fixture-product')?.value||'Test product';return <main style={{padding:24}}><h1>Products</h1><input aria-label="Product filter" defaultValue="Games"/><div style={{height:500}}/><article><h2>{name}</h2><Link id="edit-product" href="/admin/products/test/edit/general" scroll={false}>Edit product</Link></article><div style={{height:1200}}/></main>}`);
for(const file of ['default.tsx','page.tsx','[...rest]/page.tsx','(.)[id]/edit/layout.tsx','(.)[id]/edit/page.tsx']){
 write('app/admin/products/@editor/'+file,fs.readFileSync('app/admin/products/@editor/'+file,'utf8'));
}
fs.rmSync(path.join(fixture,'app/admin/products/@editor/(.)[id]/edit/loading.tsx'),{force:true});
let tabComponent=fs.readFileSync('components/ProductEditPageTabs.tsx','utf8');
tabComponent=tabComponent.replace(/import \{ getProductPaypalychRestriction[^\n]+\n/,'').replace(/import PaypalychProductWarning[^\n]+\n/,'').replace(/  const blockedBrand =[^\n]+\n/,'').replace(/    <PaypalychProductWarning[^\n]+\n/,'');
tabComponent=tabComponent.replace('"./ProductEditorWarmup"','"@/components/ProductEditorWarmup"');
write('Tabs.tsx',tabComponent);
write('actions.ts',`'use server';import {cookies} from 'next/headers';import {redirect} from 'next/navigation';import {revalidatePath} from 'next/cache';export async function save(form:FormData){const name=String(form.get('name')||'');const tab=String(form.get('tab'));if(!name)redirect('/admin/products/test/edit/'+tab+'?error=Name+required');(await cookies()).set('fixture-product',name);revalidatePath('/');redirect('/admin/products/test/edit/'+tab+'?success=Saved');}`);
write('EditPage.tsx',`import Link from 'next/link';import {cookies} from 'next/headers';import Tabs from './Tabs';import {save} from './actions';export default async function Edit({tab,searchParams}:{tab:string;searchParams:Promise<{success?:string;error?:string}>}){const q=await searchParams;return <div className="min-h-screen bg-white text-slate-900"><div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row"><aside data-admin-sidebar>Admin sidebar</aside><main className="min-w-0 flex-1 p-5 sm:p-8"><header><h1>Test product</h1><Link href="/admin/products">Product list</Link></header>{q.success&&<p data-editor-notice role="status">{q.success}</p>}{q.error&&<p data-editor-notice role="alert">{q.error}</p>}<div className="mt-8"><Tabs productId="test" current={tab}/></div><h2 className="mt-6 text-xl font-bold">{tab}</h2><form action={save} className="mt-4 grid gap-4 rounded-xl border border-slate-200 p-4"><input name="tab" type="hidden" value={tab}/><label className="grid gap-2 text-sm font-bold">Product name<input className="min-w-0 rounded-lg border border-slate-300 px-3 py-2" name="name" defaultValue={(await cookies()).get('fixture-product')?.value||'Test product'}/></label><button className="rounded-lg bg-blue-600 px-4 py-3 font-bold text-white">Save changes</button></form><div style={{height:1100}}>Long product form</div><button>Bottom action</button></main></div></div>}`);
for(const [tab] of tabs){
 write('app/admin/products/[id]/edit/'+tab+'/page.tsx',`import Edit from '../../../../../../EditPage';export default function Page({searchParams}:{searchParams:Promise<{success?:string;error?:string}>}){return <Edit tab="${tab}" searchParams={searchParams}/>} `);
 const original=fs.readFileSync('app/admin/products/@editor/(.)[id]/edit/'+tab+'/page.tsx','utf8');
 assert(original.includes('@/app/admin/products/[id]/edit/'+tab+'/page'),'Interception must reuse the secured original page');
 write('app/admin/products/@editor/(.)[id]/edit/'+tab+'/page.tsx',original.replace('@/app/admin/products/[id]/edit/'+tab+'/page','../../../../[id]/edit/'+tab+'/page'));
}
(async()=>{
 const production=process.argv.includes('--production');
 if(production){
  const built=spawnSync(process.execPath,[require.resolve('next/dist/bin/next'),'build',fixture],{cwd:root,windowsHide:true,encoding:'utf8',timeout:180000});
  assert.equal(built.status,0,(built.stdout||'')+(built.stderr||''));
 }
 const logs=[];const server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),production?'start':'dev',fixture,'--port','3011','--hostname','127.0.0.1'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',d=>logs.push(d.toString()));server.stderr.on('data',d=>logs.push(d.toString()));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try{
  let ready=false;for(let i=0;i<60;i++){try{const r=await fetch('http://localhost:3011/admin/products');if(r.ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,500));}assert(ready,logs.join('').slice(-3000));
  const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  const list='http://localhost:3011/admin/products?category=games&page=2';
  if(production){
   await page.setViewportSize({width:1440,height:850});
   await page.goto(list);
   const warmed=[];
   page.on('response',response=>{if(response.request().headers()['next-router-prefetch']==='1')warmed.push(response.url());});
   const edit=page.locator('#edit-product');await edit.scrollIntoViewIfNeeded();await edit.hover();
   for(let i=0;i<100&&!warmed.some(url=>url.includes('/edit/general'));i++)await page.waitForTimeout(100);
   assert(warmed.some(url=>url.includes('/edit/general')),'Hover should fully prefetch the editor in production');
   await edit.click();const dialog=page.getByRole('dialog',{name:'Edit product'});await dialog.waitFor();
   for(let i=0;i<100&&!warmed.some(url=>url.includes('/edit/gallery'));i++)await page.waitForTimeout(100);
   assert(warmed.some(url=>url.includes('/edit/gallery')),'Visible tabs should prefetch in production');
   // Give the prefetched response body time to finish, not just its headers.
   await page.waitForTimeout(500);
   const requests=[];page.on('request',r=>{if(r.url().includes('/edit/gallery')&&r.headers()['rsc']==='1')requests.push(r.url());});
   const start=Date.now();await dialog.getByRole('link',{name:'Gallery',exact:true}).click();
   await dialog.getByRole('heading',{name:'gallery',exact:true}).waitFor();
   assert.equal(requests.length,0,'A warmed tab should open without another server round trip');
   assert.equal(await page.getByLabel('Opening page').count(),0);
   console.log('PASS production prefetch: hover opens the prepared popup; Gallery opened from cache in '+(Date.now()-start)+'ms with no tab request.');
   for(let i=0;i<100&&!warmed.some(url=>url.includes('/edit/affiliate'));i++)await page.waitForTimeout(100);
   assert(warmed.some(url=>url.includes('/edit/affiliate')),'Offscreen tabs should also be prefetched');
   const content=dialog.locator('[class*=content]');
   await content.evaluate(el=>el.scrollTo({top:200}));await page.waitForTimeout(100);
   const galleryTop=await content.evaluate(el=>el.scrollTop);
   await dialog.getByRole('link',{name:'General',exact:true}).click();await dialog.getByRole('heading',{name:'general',exact:true}).waitFor();
   await dialog.getByRole('link',{name:'Gallery',exact:true}).click();await dialog.getByRole('heading',{name:'gallery',exact:true}).waitFor();
   assert(Math.abs(await content.evaluate(el=>el.scrollTop)-galleryTop)<5,'Returning to a tab should restore its form position');
   await dialog.getByRole('textbox',{name:'Product name'}).fill('Updated after prefetch');
   const beforeSave=await dialog.getByRole('textbox',{name:'Product name'}).boundingBox();
   await dialog.getByRole('button',{name:'Save changes'}).click();
   await dialog.getByRole('status').filter({hasText:'Saved'}).waitFor();
   const afterSave=await dialog.getByRole('textbox',{name:'Product name'}).boundingBox();
   assert(Math.abs(beforeSave.y-afterSave.y)<5,'Save confirmation must not move the form');
   await dialog.getByRole('link',{name:'General',exact:true}).click();
   await dialog.getByRole('heading',{name:'general',exact:true}).waitFor();
   assert.equal(await dialog.getByRole('textbox',{name:'Product name'}).inputValue(),'Updated after prefetch','Saving must invalidate prefetched form data');
   console.log('PASS production save: previously prefetched General reflects the saved changes.');
   assert.deepEqual(errors,[]);return;
  }
  for(const width of [320,390,1440]){
   await page.setViewportSize({width,height:850});await page.goto(list);await page.locator('#edit-product').scrollIntoViewIfNeeded();
   const initialScroll=await page.evaluate(()=>scrollY);await page.locator('#edit-product').click();
   const dialog=page.getByRole('dialog',{name:'Edit product'});await dialog.waitFor();await dialog.getByRole('navigation',{name:'Product settings tabs'}).waitFor();
   assert.equal(await dialog.getByRole('navigation',{name:'Product settings tabs'}).getByRole('link').count(),tabs.length);
   assert.equal(await dialog.locator('[data-admin-sidebar]').isVisible(),false);
   assert.equal(await page.evaluate(()=>getComputedStyle(document.documentElement).overflow),'hidden');
   // An uncached slow tab must keep the current form visible, without flashing
   // the old route loading fallback or the global navigation progress bar.
   let delayedRequests=0;
   await page.route('**/edit/gallery?*',async route=>{
    if(route.request().headers()['rsc']==='1') {delayedRequests++;await new Promise(r=>setTimeout(r,1000));}
    await route.continue();
   });
   await dialog.getByRole('link',{name:'Gallery',exact:true}).click();
   await page.waitForTimeout(350);
   assert(await dialog.getByRole('heading',{name:'general',exact:true}).isVisible(),'Keep current tab while the next tab is fetched');
   assert.equal(await page.getByLabel('Opening page').count(),0);
   assert.equal(await page.getByText('Loading product settings…').count(),0);
   await dialog.getByRole('heading',{name:'gallery',exact:true}).waitFor();
   assert(delayedRequests>0,'Slow navigation test must intercept a real tab request');
   await page.unroute('**/edit/gallery?*');
   for(const [tab,label] of tabs){
    await dialog.getByRole('link',{name:label,exact:true}).click();await page.waitForURL('**/edit/'+tab);
    await dialog.getByRole('heading',{name:tab,exact:true}).waitFor();
   }
   await dialog.getByRole('link',{name:'General',exact:true}).click();await page.waitForURL('**/edit/general');
   const tabsBar=dialog.getByRole('navigation',{name:'Product settings tabs'});
   await tabsBar.evaluate(el=>{el.scrollLeft=250;});
   await dialog.getByRole('textbox',{name:'Product name'}).fill('Updated '+width);
   await dialog.getByRole('button',{name:'Save changes'}).click();await dialog.getByRole('status').filter({hasText:'Saved'}).waitFor();
   assert(await dialog.isVisible(),'Save redirect should retain popup');
   assert(Math.abs(await tabsBar.evaluate(el=>el.scrollLeft)-Math.min(250,await tabsBar.evaluate(el=>el.scrollWidth-el.clientWidth)))<5,'Save must retain the horizontal tab position');
   await dialog.evaluate(el=>{el.scrollTop=64;});
   const popupBox=await dialog.boundingBox(),closeBox=await dialog.getByRole('button',{name:'Close product editor'}).boundingBox();
   assert(closeBox.y>=popupBox.y&&closeBox.y+closeBox.height<=popupBox.y+popupBox.height,'Close button must remain inside the popup after browser scroll restoration');
   await dialog.getByRole('textbox',{name:'Product name'}).fill('');await dialog.getByRole('button',{name:'Save changes'}).click();await dialog.getByRole('alert').waitFor();
   assert(await dialog.isVisible(),'Validation redirect should retain popup');
   await dialog.getByRole('button',{name:'Bottom action'}).scrollIntoViewIfNeeded();assert(await dialog.getByRole('button',{name:'Close product editor'}).isVisible());
   const bounds=await dialog.boundingBox();assert(bounds.x>=0&&bounds.width<=width&&bounds.y>=0&&bounds.height<=850);
   await dialog.locator('[class*=content]').evaluate(el=>el.scrollTo({top:0}));
   await dialog.getByRole('button',{name:'Close product editor'}).focus();await page.keyboard.press('Tab');
   assert(await dialog.evaluate(el=>el.contains(document.activeElement)),'Keyboard focus must stay in the popup');
   await dialog.screenshot({path:path.join(screenshots,'product-editor-popup-'+width+'.png')});
   await dialog.getByRole('button',{name:'Close product editor'}).click();await page.waitForURL(list);await dialog.waitFor({state:'detached'});
   assert(Math.abs(await page.evaluate(()=>scrollY)-initialScroll)<5,'Closing restores list scroll');
   await page.getByRole('heading',{name:'Updated '+width,exact:true}).waitFor();
   await page.locator('#edit-product').click();await dialog.waitFor();
   await dialog.getByRole('heading',{name:'Edit product',exact:true}).click();
   assert(await dialog.isVisible(),'Clicks inside must not dismiss the editor');
   const box=await dialog.boundingBox();
   await page.mouse.move(box.x+40,box.y+30);await page.mouse.down();await page.mouse.move(width/2,1);await page.mouse.up();
   assert(await dialog.isVisible(),'Dragging from the editor to the backdrop must not dismiss it');
   await page.mouse.click(width/2,1);await page.waitForURL(list);await dialog.waitFor({state:'detached'});
   assert(Math.abs(await page.evaluate(()=>scrollY)-initialScroll)<5,'Backdrop dismissal restores list scroll');
   await page.locator('#edit-product').click();await dialog.waitFor();await page.keyboard.press('Escape');await page.waitForURL(list);await dialog.waitFor({state:'detached'});
   await page.locator('#edit-product').click();await dialog.waitFor();await page.goBack();await page.waitForURL(list);await dialog.waitFor({state:'detached'});
   await page.goForward();await dialog.waitFor();
   await page.reload();assert.equal(await page.getByRole('dialog').count(),0,'Direct loads retain full editor');
   console.log('Passed product popup at '+width+'px: all '+tabs.length+' tabs, saves, validation, visible close button, outside click, inside/drag protection, Escape, Back/Forward, filter/scroll restoration, refresh.');
  }
  assert.deepEqual(errors,[]);
 }catch(error){console.error(error);console.error(logs.join('').slice(-2500));throw error;}finally{
  await browser.close();
  if(process.platform==='win32')spawnSync('taskkill',['/PID',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});
  else server.kill();
 }

})().catch(error=>{console.error(error);process.exitCode=1;});
