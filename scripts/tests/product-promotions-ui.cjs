// Real client components with mocked network responses. No live orders or settings are written.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),http=require('node:http');
const root=process.cwd(),out=path.join(root,'tmp/product-promotions-ui');fs.mkdirSync(out,{recursive:true});
const write=(name,text)=>fs.writeFileSync(path.join(out,name),text);
// Preserve nested selectors such as :not() when loading CSS modules in the fixture.
const unwrapGlobal=css=>css.replace(/:global\(((?:[^()]|\([^()]*\))*)\)/g,'$1');
write('ts-loader.cjs',`const ts=require(${JSON.stringify(require.resolve('typescript'))});module.exports=s=>ts.transpileModule(s,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;`);
write('css-loader.cjs',`module.exports=s=>'module.exports='+JSON.stringify(Object.fromEntries([...s.matchAll(/\\.([a-zA-Z_][\\w-]*)/g)].map(m=>[m[1],m[1]])));`);
write('preferences.js',`exports.useStorePreferences=()=>({language:'en',currency:'USD',setCurrency:()=>{},formatPrice:n=>'$'+n.toFixed(2),t:k=>({buyNow:'Buy Now',addToCart:'Add to Cart',total:'Total'}[k]||k)});`);
write('navigation.js',`exports.useRouter=()=>({push:p=>window.fixtureNavigation=p});`);
write('link.js',`module.exports=({children,...props})=>require('react').createElement('a',props,children);`);
write('image.js',`module.exports=({unoptimized,priority,fill,...props})=>require('react').createElement('img',props);`);
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
write('entry.js',`const React=require('react'),{createRoot}=require('react-dom/client');
const Editor=require(${JSON.stringify(path.join(root,'app/admin/products/[id]/edit/product-options/ProductDiscountEditor.tsx'))}).default;
const Range=require(${JSON.stringify(path.join(root,'components/RangePurchaseForm.tsx'))}).default;
const Product=require(${JSON.stringify(path.join(root,'app/product/[slug]/ProductPurchaseForm.tsx'))}).default;
const Checkout=require(${JSON.stringify(path.join(root,'app/checkout/page.tsx'))}).default;
const params=new URLSearchParams(location.search),expiry=new Date(Date.now()+(params.has('expire')?1800:86400000)).toISOString();
const rules=[{optionId:null,percent:20,endsAt:expiry}];
let component;
if(location.pathname==='/checkout')component=React.createElement(Checkout);
else if(location.pathname==='/range')component=React.createElement(Range,{range:{product_id:'${id(1)}',option_id:'${id(2)}',enabled:true,currency:'INR',minimum:100,maximum:10000,step:1,price_basis:100,price_usd:10},product:{id:'${id(1)}',name:'Test range',slug:'test',minimum_quantity:1,maximum_quantity:10,is_bulk_order:false},discountPercent:Number(params.get('personal')||10),promotionRules:rules});
else if(location.pathname==='/product')component=React.createElement(Product,{product:{id:'${id(1)}',slug:'test',categorySlug:'playstation-games',name:'Test game',imageUrl:null,currency:'USD',productType:'GIFT_CARD',deliveryType:'MANUAL',allowsFixedValues:true,allowsCustomValue:false,allowsPlayerIdTopup:false,allowsGamingVoucher:false,minimumQuantity:1,maximumQuantity:10,isUnlimitedStock:true,customerDiscountPercent:Number(params.get('personal')||10),promotionRules:rules},options:[{id:'${id(2)}',optionName:'Standard Edition',platform:'PS5',denomination:100,sellingPrice:100,stockQuantity:10,isCustomValue:false,isInStock:true},{id:'${id(3)}',optionName:'Deluxe Edition',platform:'PS5',denomination:200,sellingPrice:200,stockQuantity:10,isCustomValue:false,isInStock:true}]});
else component=React.createElement(Editor,{productId:'${id(1)}',revision:'',ready:true,rules:[],options:[{id:'${id(2)}',name:'Standard Edition',price:100},{id:'${id(3)}',name:'Deluxe Edition',price:200}],action:async f=>{window.savedDiscounts=JSON.parse(f.get('rules'));}});
if(location.pathname==='/product'){
 if(params.has('layout'))component=React.cloneElement(component,{product:{...component.props.product,promotionRules:[{optionId:'${id(2)}',percent:30,endsAt:expiry}]},options:[{...component.props.options[0],optionName:'007 First Light — PS5',sellingPrice:48.96},{...component.props.options[1],optionName:'Deluxe Edition — PS5',sellingPrice:58.76}]});
 component=React.createElement('div',{className:'page'},React.createElement('div',{className:'container'},React.createElement('section',{className:'panel compact'},React.createElement('aside',{className:'purchase'},component))));
}
createRoot(document.getElementById('app')).render(component);`);
(async()=>{
 const {webpack}=require('next/dist/compiled/webpack/webpack-lib');
 await new Promise((resolve,reject)=>webpack({mode:'development',devtool:false,entry:path.join(out,'entry.js'),output:{path:out,filename:'bundle.js'},module:{rules:[{test:/\.tsx?$/,use:path.join(out,'ts-loader.cjs')},{test:/\.css$/,use:path.join(out,'css-loader.cjs')}]},resolve:{extensions:['.tsx','.ts','.js'],alias:{'@/components/StorePreferences':path.join(out,'preferences.js'),[path.join(root,'components/StorePreferences')]:path.join(out,'preferences.js'),'@':root,'next/navigation':path.join(out,'navigation.js'),'next/link':path.join(out,'link.js'),'next/image':path.join(out,'image.js')}}},(err,stats)=>err||stats.hasErrors()?reject(err||Error(stats.toString({all:false,errors:true}))):resolve()));
 const globals=fs.readdirSync('.next/static/chunks').filter(n=>n.endsWith('.css')).map(n=>fs.readFileSync('.next/static/chunks/'+n,'utf8')).join('\n');
 const modules=['components/RangePurchaseForm.module.css','app/product/[slug]/ProductPurchaseForm.module.css','app/checkout/Checkout.module.css'].map(f=>unwrapGlobal(fs.readFileSync(f,'utf8'))).join('\n');
 const productCss=unwrapGlobal(fs.readFileSync('app/product/[slug]/ProductPage.module.css','utf8'));
 const server=http.createServer((req,res)=>{const isProduct=req.url.startsWith('/product');res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript; charset=utf-8':'text/html; charset=utf-8');res.end(req.url==='/bundle.js'?fs.readFileSync(path.join(out,'bundle.js')):'<!doctype html><html data-store-theme="light"><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+globals+'\n'+modules+(isProduct?'\n'+productCss:'')+'</style></head><body><main id="app" style="'+(isProduct?'':'max-width:1100px;margin:auto;padding:16px')+'"></main><script src="/bundle.js"></script></body></html>');});await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const {chromium}=require('C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'),browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  const page=await browser.newPage({viewport:{width:1280,height:950}}), errors=[];page.on('pageerror',e=>errors.push(e.message));
  let sale=20,personal=10,posted=null;
  await page.route('**/api/**',async route=>{
   const url=new URL(route.request().url()),req=route.request();
   if(url.pathname==='/api/products/prices')return route.fulfill({json:{prices:req.postDataJSON().items.map((i,index)=>({index,productOptionId:i.productOptionId,price:100*(1-sale/100),regularPrice:100,salePercent:sale,saleEndsAt:new Date(Date.now()+86400000).toISOString(),expectedSaleUnitPrice:100*(1-sale/100)}))}});
   if(url.pathname==='/api/products/quantity-limits')return route.fulfill({json:{limits:req.postDataJSON().items.map(i=>({...i,minimumQuantity:1,maximumQuantity:10,availableQuantity:10,denominationCurrency:'USD'}))}});
   if(url.pathname==='/api/customer-discounts')return route.fulfill({json:{authenticated:true,email:'test@example.com',discounts:{[id(1)]:personal}}});
   if(url.pathname==='/api/wallet/balance')return route.fulfill({json:{authenticated:true,balance:500,currency:'USD'}});
   if(url.pathname==='/api/products/payment-restrictions')return route.fulfill({json:{allowedPaymentMethods:['BINANCE_PAY'],allowedUsdtNetworks:[]}});
   if(url.pathname==='/api/orders'&&req.method()==='GET')return route.fulfill({json:{fee:0,total:Number(url.searchParams.get('baseTotal'))}});
   if(url.pathname==='/api/orders'){posted=req.postDataJSON();return route.fulfill({status:400,json:{error:'Mock order only. No purchase made.'}});}
   return route.fulfill({status:400,json:{error:'Unexpected fixture request'}});
  });
  const base='http://127.0.0.1:'+server.address().port;
  await page.goto(base+'/product?personal=0&layout=1');
  await page.locator('.product-option-button').first().waitFor();
  await page.locator('.product-option-button').first().getByText('$34.27',{exact:true}).waitFor();
  await page.locator('.product-option-button').nth(1).getByText('$58.76',{exact:true}).waitFor();
  assert.equal(await page.locator('.product-option-button').nth(1).getByText(/Save .*Ends/).count(),0,'Other editions retain normal pricing');
  for(const width of [1440,1024,768,390,320]){
   await page.setViewportSize({width,height:1000});
   const dimensions=await page.locator('.product-option-button').first().evaluate(button=>{
    const name=button.firstElementChild,price=button.querySelector('.product-option-price'),sale=[...button.querySelectorAll('span')].find(span=>span.textContent.startsWith('Save '));
    const box=element=>{const r=element.getBoundingClientRect();return {width:r.width,height:r.height,top:r.top,bottom:r.bottom,left:r.left,right:r.right};};
    return {button:box(button),name:box(name),price:box(price),sale:box(sale),overflow:button.scrollWidth>button.clientWidth+1};
   });
   assert.ok(dimensions.name.width>=70,'Option title remains readable at '+width+': '+JSON.stringify(dimensions));
   assert.ok(dimensions.name.height<=68,'Option title does not wrap letter by letter at '+width);
   assert.ok(dimensions.price.left>=dimensions.name.right-1||dimensions.price.top>=dimensions.name.bottom-1,'Name and price never overlap at '+width);
   assert.ok(dimensions.sale.top>=Math.max(dimensions.name.bottom,dimensions.price.bottom)-1,'Expiry has its own row at '+width);
   assert.ok(dimensions.button.height<220,'Option card remains compact at '+width);
   assert.equal(dimensions.overflow,false,'Option card overflow '+width);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Product page overflow '+width);
   await page.screenshot({path:path.join(out,'product-'+width+'.png'),fullPage:true});
  }
  await page.setViewportSize({width:1280,height:950});
  await page.goto(base+'/editor');
  await page.getByLabel('Discount for whole product',{exact:true}).selectOption('discount');
  await page.getByLabel('Percentage for whole product',{exact:true}).fill('20');
  const expiry=new Date(Date.now()+86400000+330*60000).toISOString().slice(0,16);
  await page.getByLabel('Expiry for whole product',{exact:true}).fill(expiry);
  await page.getByLabel('Discount for Deluxe Edition',{exact:true}).selectOption('discount');
  await page.getByLabel('Percentage for Deluxe Edition',{exact:true}).fill('35');
  await page.getByLabel('Expiry for Deluxe Edition',{exact:true}).fill(expiry);
  await page.getByText('Sale price: $130.00 USD',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Save discounts',exact:true}).click();await page.waitForFunction(()=>window.savedDiscounts?.length===2);
  assert.equal(await page.getByLabel('Discount for whole product',{exact:true}).inputValue(),'discount','Saving preserves the visible selected discount mode');const saved=await page.evaluate(()=>window.savedDiscounts);assert.equal(saved[0].percent,20);assert.equal(saved[1].optionId,id(3));assert.equal(new Date(saved[0].endsAt).getTime(),new Date(expiry+':00+05:30').getTime());
  for(const width of [1280,390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Admin form overflow '+width);await page.screenshot({path:path.join(out,'admin-'+width+'.png'),fullPage:true});}
  assert.equal(await page.getByLabel('Discount for whole product',{exact:true}).inputValue(),'discount','Saved discount still selected after render'); await page.getByLabel('Expiry for Deluxe Edition',{exact:true}).fill('2025-01-01T12:00');await page.evaluate(()=>delete window.savedDiscounts);await page.getByRole('button',{name:'Save discounts',exact:true}).click();await page.getByRole('alert').filter({hasText:'future expiry'}).waitFor();assert.equal(await page.evaluate(()=>window.savedDiscounts),undefined);
  await page.setViewportSize({width:1280,height:950});
  await page.goto(base+'/range?personal=10&expire=1');await page.getByLabel('Denomination for Test range').fill('1000');await page.getByText('$80.00 / code',{exact:true}).waitFor();await page.getByText('$90.00 / code',{exact:true}).waitFor({timeout:7000});
  await page.goto(base+'/range?personal=30');await page.getByLabel('Denomination for Test range').fill('1000');await page.getByText('$70.00 / code',{exact:true}).waitFor();
  await page.goto(base+'/product?personal=10&expire=1');await page.getByRole('button',{name:/Standard Edition/}).getByText('$80.00',{exact:true}).waitFor();await page.getByRole('button',{name:/Standard Edition/}).getByText('$90.00',{exact:true}).waitFor({timeout:7000});
  await page.addInitScript(({pid,oid})=>localStorage.setItem('checkoutCart',JSON.stringify([{id:'test-cart',productId:pid,productOptionId:oid,name:'Test game',price:100,quantity:2,productType:'GIFT_CARD'}])),{pid:id(1),oid:id(2)});
  await page.goto(base+'/checkout');const checkout=page.locator('#checkout-form');await checkout.waitFor();await page.waitForFunction(()=>document.querySelector('#email')?.value==='test@example.com');
  await page.locator('input[value="binance"]').check();await checkout.getByRole('button',{name:/Continue to Payment.*160/}).waitFor();
  await checkout.getByRole('checkbox').first().check();sale=0;
  await checkout.getByRole('button',{name:/Continue to Payment/}).click();await checkout.getByRole('alert').filter({hasText:/price changed|prices changed|discount changed/i}).waitFor();assert.equal(posted,null,'Expiry requires total review before submitting an order');
  await checkout.getByRole('button',{name:/Continue to Payment.*180/}).waitFor();await checkout.getByRole('button',{name:/Continue to Payment/}).click();await checkout.getByRole('alert').filter({hasText:'Mock order only'}).waitFor();assert.equal(posted.items[0].expectedSaleUnitPrice,100);assert.equal(posted.items[0].quantity,2);
  sale=20;personal=30;await page.reload();await checkout.getByRole('button',{name:/Continue to Payment.*140/}).waitFor();
  for(const width of [1280,390,320]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Checkout overflow '+width);}
  assert.deepEqual(errors,[]);console.log('PASS: admin per-denomination save and IST expiry; mobile widths; fixed/range live expiry; larger personal discount; checkout refresh, expiry review and safe mocked submission.');
 } finally {await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
