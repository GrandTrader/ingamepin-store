const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawn,spawnSync}=require('node:child_process');
const {chromium}=require('C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=process.cwd(),fixture=path.join(root,'tmp/admin-switch-fixture');
const write=(p,s)=>{const f=path.join(fixture,p);fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,s)};
write('package.json',JSON.stringify({name:'isolated-admin-switches-test',private:true}));
write('tsconfig.json',JSON.stringify({compilerOptions:{target:'ES2022',lib:['dom','esnext'],jsx:'react-jsx',module:'esnext',moduleResolution:'bundler',esModuleInterop:true,skipLibCheck:true,paths:{'@/*':['../../*']}},include:['**/*.ts','**/*.tsx','.next/types/**/*.ts']}));
write('next.config.js','module.exports={devIndicators:false,turbopack:{root:'+JSON.stringify(root)+'}};');
write('postcss.config.mjs','export default {plugins:{"@tailwindcss/postcss":{}}};');
write('styles.css','@import "../../app/globals.css";@source "../../components";@source "../../app/admin";@source "./";');
write('app/layout.tsx','import "../styles.css";export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}</body></html>}');
write('app/admin/layout.tsx','import AdminFrame from "@/components/AdminFrame";export default function Layout({children}:{children:React.ReactNode}){return <AdminFrame>{children}</AdminFrame>}');
write('app/api/admin/order-notifications/route.ts','export async function GET(){return Response.json({count:0,orderStatusCounts:{}})}');
const dir='app/admin/products/';
for(const f of ['ProductListSwitch.tsx','ProductSalesSwitch.tsx','ProductChannelSwitches.tsx'])write(dir+f,fs.readFileSync(dir+f,'utf8'));
for(const f of ['actions.ts','channel-actions.ts'])write(dir+f,fs.readFileSync(dir+f,'utf8').replace(/from "@\/lib\/[^"]+"/g,'from "../../../fixture-db"'));
let page=fs.readFileSync(dir+'page.tsx','utf8');
page=page.replace('from "@/lib/supabase/server"','from "../../../fixture-db"').replace('from "@/lib/product-sales"','from "../../../fixture-db"').replace('from "@/lib/product-views"','from "../../../fixture-db"').replace('from "../AdminSidebar"','from "@/app/admin/AdminSidebar"');
write(dir+'page.tsx',page);
write(dir+'CodeSearch.tsx','export default function CodeSearch(){return null}');
write(dir+'ProductBulkSelection.tsx','export function SelectedProductActions(){return <div>Fixture bulk actions</div>}export function SelectAllProductsCheckbox(){return <input type="checkbox" aria-label="Select all products on this page"/>}');
write('fixture-db.ts',"import {cookies} from 'next/headers';\nexport const uploadDigiSellerProductImage=async()=>{};\nexport const syncDigiSellerStatistics=async()=>({productsUpdated:0});\nexport const uploadStoreImage=async()=>{};\nexport const prepareCustomerFieldsSave=async()=>{};\nexport const readCustomerFields=async()=>[];\nexport const getPaidProductSales=async()=>new Map();\nexport const getProductVisitorCounts=async()=>new Map();\nasync function rows(){\n const jar=await cookies();\n return Array.from({length:45},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),public_id:874868300+i,name:'Apple India Gift Card '+(i+1),slug:'fixture-'+i,price:10,currency:'USD',stock_quantity:10,sold_count:1,bulk_discount_percent:0,status:'ACTIVE',category_id:'apple',region:'India',is_bulk_order:false,retail_enabled:true,business_enabled:true,categories:{name:'Apple Store iTunes',slug:'apple',public_id:1},product_options:[],...JSON.parse(jar.get('row-'+(i+1))?.value||'{}')}));\n}\nfunction from(table:string){\n let changes:any=null;const filters:Array<[string,any]>=[];\n const query:any={select(){return query},eq(k:string,v:any){filters.push([k,v]);return query},update(value:any){changes=value;return query},\n async maybeSingle(){\n   if(table==='admin_users')return {data:{role:'ADMIN',user_id:'admin'},error:null};\n   await new Promise(r=>setTimeout(r,400));\n   const jar=await cookies();if(jar.get('fixture-fail')?.value==='yes')return {data:null,error:{message:'Fixture failure'}};\n   const row=(await rows()).find(r=>filters.every(([k,v])=>(r as any)[k]===v));\n   if(!row)return {data:null,error:null};\n   const key='row-'+Number(row.id.slice(-12));jar.set(key,JSON.stringify({...JSON.parse(jar.get(key)?.value||'{}'),...changes}));\n   return {data:row,error:null};\n },async single(){return query.maybeSingle()},then(resolve:any){return rows().then(data=>resolve({data,error:null}))}};\n return query;\n}\nexport function createAdminClient(){return {from}}\nexport async function createClient(){return {auth:{getUser:async()=>({data:{user:{id:'admin'}}})},from}}\n");
(async()=>{
 const logs=[],server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'dev',fixture,'--port','3013','--hostname','127.0.0.1'],{cwd:root,windowsHide:true,stdio:['ignore','pipe','pipe']});
 server.stdout.on('data',d=>logs.push(d.toString()));server.stderr.on('data',d=>logs.push(d.toString()));
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch('http://localhost:3013/admin/products')).ok){ready=true;break}}catch{}await new Promise(r=>setTimeout(r,500))}assert(ready,logs.join('').slice(-2500));
  for(const width of [390,1440]){
   const context=await browser.newContext({viewport:{width,height:850}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const url='http://localhost:3013/admin/products?q=Apple&category=apple&region=India&kind=RETAIL&status=ALL&sort=ID_DESC&page=2';
   await page.goto(url);await page.getByRole('switch').first().waitFor();await page.waitForTimeout(500);
   const name='Apple India Gift Card 25',sales=page.getByRole('switch',{name:'Sales for '+name,exact:true}),business=page.getByRole('switch',{name:'Business portal for '+name}),retail=page.getByRole('switch',{name:'Retail site for '+name});
   assert.equal(await page.locator('tbody tr').count(),20);
   const unchanged=async()=>{assert.equal(page.url(),url);assert.equal(await page.getByLabel('Region',{exact:true}).inputValue(),'India');assert.equal(await page.getByLabel('Category',{exact:true}).inputValue(),'apple');assert.equal(await page.locator('tbody tr').count(),20)};
   for(const control of [sales,business,retail]){
    await control.scrollIntoViewIfNeeded();
    const before=await page.locator('[data-admin-scroll]').evaluate(el=>({top:el.scrollTop,left:el.scrollLeft}));
    const tableLeft=await page.locator('table').evaluate(el=>el.scrollLeft);
    const box=await control.locator('[data-product-switch-track]').boundingBox(),hit=await control.boundingBox();
    assert.equal(box.width,32);assert.equal(box.height,18);assert(hit.width>=44&&hit.height>=44);
    await control.click();assert(await control.isDisabled());await page.waitForFunction(label=>!document.querySelector('[aria-label="'+label+'"]').disabled,await control.getAttribute('aria-label'));
    assert.equal(await control.getAttribute('aria-checked'),'false');await unchanged();
    const after=await page.locator('[data-admin-scroll]').evaluate(el=>({top:el.scrollTop,left:el.scrollLeft}));assert.deepEqual(after,before,'Save preserves frame scroll');
    assert.equal(await page.locator('table').evaluate(el=>el.scrollLeft),tableLeft,'Save preserves horizontal table scroll');
   }
   await context.addCookies([{name:'fixture-fail',value:'yes',url:'http://localhost:3013'}]);
   await sales.click();await page.getByRole('alert').filter({hasText:'Unable to save product sales'}).waitFor();assert.equal(await sales.getAttribute('aria-checked'),'false');await unchanged();
   await context.addCookies([{name:'fixture-fail',value:'no',url:'http://localhost:3013'}]);
   await sales.click();await page.waitForFunction(()=>!document.querySelector('[aria-label="Sales for Apple India Gift Card 25"]').disabled);assert.equal(await sales.getAttribute('aria-checked'),'true');await unchanged();
   await page.reload();await sales.waitFor();assert.equal(await sales.getAttribute('aria-checked'),'true');assert.equal(await business.getAttribute('aria-checked'),'false');assert.equal(await retail.getAttribute('aria-checked'),'false');
   await sales.scrollIntoViewIfNeeded();await page.screenshot({path:path.join(fixture,'switches-'+width+'.png')});
   assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'Viewport must not overflow');
   assert.deepEqual(errors,[]);console.log('PASS '+width+'px: compact switches, real actions, filters/page/scroll retained, pending state, failure rollback and persistence.');
   await context.close();
  }
 }catch(e){console.error(logs.join('').slice(-3500));throw e}finally{await browser.close();if(process.platform==='win32')spawnSync('taskkill',['/PID',String(server.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else server.kill()}
})().catch(e=>{console.error(e);process.exitCode=1});
