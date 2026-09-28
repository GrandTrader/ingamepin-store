const fs=require('fs'),path=require('path'),vm=require('vm'),ts=require('typescript'),http=require('http'),assert=require('assert/strict');
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const root=process.cwd(),out=path.join(root,'tmp/business-portal-ui');fs.mkdirSync(out,{recursive:true});
const css=fs.readFileSync('app/account/portal/Portal.module.css','utf8'),classes=Object.fromEntries([...css.matchAll(/\.([A-Za-z][A-Za-z0-9]*)/g)].map(m=>[m[1],m[1]]));
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,{exports,require:n=>{if(n in mocks)return mocks[n];if(n==='react'||n==='react/jsx-runtime')return require(n);throw Error('Missing '+n)},URLSearchParams,Date,Intl,Map,Set,console});return exports;}
const link={__esModule:true,default:({href,children,...p})=>React.createElement('a',{...p,href},children)},style={__esModule:true,default:classes},helpers=load('lib/business-portal.ts');
const fixtureProduct=(id,name,region,price)=>({id,name,slug:id,image_url:null,region,currency:'USD',is_bulk_order:true,delivery_type:'AUTO',product_type:'GIFT_CARD',minimum_quantity:1,maximum_quantity:null,stock_quantity:100,allows_player_id_topup:false,sold_count:100,categories:{name:'Gaming',slug:'gaming'},product_customer_fields:[],product_options:[{id:id+'-50',option_name:'50 USD',denomination:50,selling_price:price,minimum_quantity:1,maximum_quantity:null,is_custom_value:false,is_active:true,is_in_stock:true,stock_quantity:100}]});
const products=[fixtureProduct('apple','Apple Gift Card','United States',48.5),fixtureProduct('ps','PlayStation Store Gift Card','United States',47.5),fixtureProduct('steam','Steam Wallet Code','India',49)];
const orders=[{id:'test-order',order_number:'IP20260928123456',total:965,currency:'USD',status:'DELIVERED',created_at:'2026-09-28T06:30:00Z',order_items:[{id:'item1',product_name:'Apple Gift Card',option_name:'50 USD',quantity:10},{id:'item2',product_name:'PlayStation Store Gift Card',option_name:'50 USD',quantity:10}]},{id:'order2',order_number:'OLD-5296',total:125,currency:'USD',status:'CANCELLED',created_at:'2026-09-25T08:20:00Z',order_items:[{id:'item3',product_name:'Steam Wallet Code',option_name:'25 USD',quantity:5}]}];
const transactions=[{id:'t1',created_at:'2026-09-28T06:30:00Z',transaction_type:'DEBIT',description:'Order payment',order_id:'test-order',reference_id:'IP20260928123456',amount:965,balance_after:3503.46},{id:'t2',created_at:'2026-09-27T09:40:00Z',transaction_type:'CREDIT',description:'Bank deposit approved',reference_id:'BANK-TEST-014',amount:2000,balance_after:4468.46}];
const data={portalCustomer:async()=>({email:'test@example.invalid',user:{id:'fixture'}}),customerOrders:()=>({range:async()=>({data:orders,count:2})}),customerStatement:()=>({range:async()=>({data:transactions,count:2})}),businessSummary:async()=>({name:'Sample verified business',wallet:{balance:3503.46,currency:'USD'},...helpers.monthlyBusinessTier([{id:'o',subtotal:4250,discount:0,currency:'USD',status:'DELIVERED',paid_at:'2026-09-15T12:00:00Z'}],[],new Date('2026-09-28'))})};
const nav=load('app/account/portal/PortalNav.tsx',{'next/link':link,'next/navigation':{usePathname:()=>'/account/portal'},'./Portal.module.css':style});
const shared=load('app/account/portal/Shared.tsx',{'next/link':link,'./Portal.module.css':style});
const layout=load('app/account/portal/layout.tsx',{'next/link':link,'@/lib/business-portal-data':data,'@/lib/business-portal':helpers,'../actions':{customerLogout:'/logout'},'./PortalNav':nav,'./Portal.module.css':style}).default;
function html(markup,script=''){return '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>*{box-sizing:border-box}body{margin:0;background:#f5f7fa;font-family:Arial,sans-serif}h1,h2,p{margin:0}a{color:inherit}button,input,select{font:inherit}'+css+'</style></head><body>'+markup+script+'</body></html>'}
(async()=>{
 for(const [file,name] of [['app/account/portal/page.tsx','orders'],['app/account/portal/statement/page.tsx','statement']]){const page=load(file,{'next/link':link,'@/lib/business-portal-data':data,'@/lib/business-portal':helpers,'./Shared':shared,'../Shared':shared,'./Portal.module.css':style,'../Portal.module.css':style}).default;fs.writeFileSync(path.join(out,name+'.html'),html(renderToStaticMarkup(await layout({children:await page({searchParams:Promise.resolve({})})}))));}
 fs.writeFileSync(path.join(out,'new.html'),html(renderToStaticMarkup(await layout({children:React.createElement('div',{id:'app'})})),'<script src="/bundle.js"></script>'));
 for(const [src,dest] of [['lib/business-portal.ts','helpers.js'],['lib/cart-stock.ts','stock.js'],['app/account/portal/new/ProductTable.tsx','ProductTable.js'],['app/account/portal/new/Catalogue.tsx','Catalogue.js']])fs.writeFileSync(path.join(out,dest),ts.transpileModule(fs.readFileSync(src,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText);
 fs.writeFileSync(path.join(out,'styles.js'),'module.exports={__esModule:true,default:'+JSON.stringify(classes)+'};');
 fs.writeFileSync(path.join(out,'link.js'),`const React=require('react');module.exports={__esModule:true,default:({href,children,...p})=>React.createElement('a',{...p,href},children)};`);
 fs.writeFileSync(path.join(out,'image.js'),`const React=require('react');module.exports={__esModule:true,default:({unoptimized,...p})=>React.createElement('img',p)};`);
 fs.writeFileSync(path.join(out,'navigation.js'),`exports.useRouter=()=>({push:path=>{window.portalNavigation=path;}});`);
 fs.writeFileSync(path.join(out,'entry.js'),`const React=require('react'),{createRoot}=require('react-dom/client');const Table=require('./Catalogue').default;createRoot(document.getElementById('app')).render(React.createElement(Table,{userId:'fixture',products:${JSON.stringify(products.map(p=>({...p,category_id:p.id==='steam'?'steam':'gaming'})))},categories:[{id:'gaming',name:'Gaming',image_url:null},{id:'steam',name:'Steam',image_url:null}],initialFilters:{},discounts:{apple:2},filters:React.createElement('div',{className:'toolbar'},React.createElement('input',{placeholder:'Search products'}),React.createElement('select',null,React.createElement('option',null,'All regions')),React.createElement('select',null,React.createElement('option',null,'All brands')))}));`);
 const webpack=require('next/dist/compiled/webpack/webpack').webpack;
 await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,entry:path.join(out,'entry.js'),output:{path:out,filename:'bundle.js'},resolve:{alias:{'next/link':path.join(out,'link.js'),'next/image':path.join(out,'image.js'),'next/navigation':path.join(out,'navigation.js'),'@/lib/business-portal':path.join(out,'helpers.js'),'@/lib/cart-stock':path.join(out,'stock.js'),'../Portal.module.css':path.join(out,'styles.js')}}},(error,stats)=>error||stats.hasErrors()?reject(error??Error(stats.toString({all:false,errors:true}))):resolve()));
 const server=http.createServer((req,res)=>{const file=path.join(out,req.url==='/'?'new.html':req.url.slice(1));if(!file.startsWith(out)||!fs.existsSync(file)){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':'text/html');res.end(fs.readFileSync(file));});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const {chromium}=require('C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});
 try{
 const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage(),base='http://127.0.0.1:'+server.address().port;const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/api/products/quantity-limits',async route=>{const {items}=route.request().postDataJSON();await route.fulfill({json:{limits:items.map(i=>({...i,availableQuantity:100,minimumQuantity:1,maximumQuantity:null}))}});});

 let requests=0;page.on('request',()=>requests++);
 await page.goto(base+'/new.html');await page.getByRole('button',{name:'Add',exact:true}).first().waitFor();
 await page.getByLabel('Quantity for Apple Gift Card 50 USD').fill('10');
 await page.getByRole('button',{name:'Add',exact:true}).first().click();
 await page.getByRole('status').filter({hasText:'added to your draft'}).waitFor();
 await page.getByRole('button',{name:'India',exact:true}).scrollIntoViewIfNeeded();
 const scroll=await page.evaluate(()=>scrollY),top=await page.getByRole('button',{name:'India',exact:true}).evaluate(e=>e.getBoundingClientRect().top);
 await page.evaluate(()=>window.stabilityMarker='same-page');
 const initialRequests=requests;
 await page.getByRole('button',{name:'India',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'Gaming',exact:true}).count(),0);
 assert.equal(await page.getByRole('button',{name:'Steam',exact:true}).count(),1);
 assert.equal(await page.getByRole('button',{name:'Add',exact:true}).count(),1);
 assert(Math.abs(await page.evaluate(()=>scrollY)-scroll)<2,'Region click must preserve scroll');
 assert(Math.abs(await page.getByRole('button',{name:'India',exact:true}).evaluate(e=>e.getBoundingClientRect().top)-top)<2,'Filter position must remain stable');
 await page.getByRole('button',{name:'Steam',exact:true}).click();
 await page.getByRole('button',{name:'United States',exact:true}).click();
 assert.equal(await page.getByRole('button',{name:'All brands',exact:true}).getAttribute('aria-pressed'),'true','Incompatible category clears');
 await page.getByRole('button',{name:'Popular products',exact:true}).click();
 await page.getByPlaceholder('Search brand or product name').fill('does not exist');
 await page.getByRole('button',{name:'Search',exact:true}).click();
 await page.getByText('No products match your filters.',{exact:true}).waitFor();
 assert.equal(await page.locator('section.draft tbody tr').count(),1,'Draft survives empty filters');
 await page.goBack();
 await page.getByRole('button',{name:'Add',exact:true}).first().waitFor();
 assert.equal(await page.evaluate(()=>window.stabilityMarker),'same-page');
 assert.equal(requests,initialRequests,'Filtering, search and Back must make no network requests');
 assert.equal(await page.locator('section.draft tbody tr').count(),1);
 await page.screenshot({path:path.join(out,'stable-filters-desktop.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.getByRole('button',{name:'India',exact:true}).scrollIntoViewIfNeeded();
 const mobileScroll=await page.evaluate(()=>scrollY);
 await page.getByRole('button',{name:'India',exact:true}).click();
 assert(Math.abs(await page.evaluate(()=>scrollY)-mobileScroll)<2,'Mobile region click must preserve scroll');
 assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No mobile horizontal overflow');
 assert.equal(errors.length,0,errors.join('\n'));
 console.log('PASS: instant region/brand/search/popular filtering, no navigation requests, stable desktop/mobile scroll, empty results, draft retention and browser Back.');
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
