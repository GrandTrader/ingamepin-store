const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),ts=require('typescript');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>{if(n in mocks)return mocks[n];throw Error('Missing mock '+n);},Date,Intl,Map,Set,URL,Response,Buffer,console},{filename:file});return exports;}
const helpers=load('lib/business-portal.ts'),now=new Date('2026-09-28T06:00:00Z');
const order=(patch={})=>({id:'order-1',subtotal:'5000',discount:'0',currency:'USD',status:'PAID',paid_at:'2026-09-15T12:00:00+00:00',...patch});
test('Reseller threshold is exactly USD 5000, after discounts and refunds',()=>{
 assert.equal(helpers.monthlyBusinessTier([order({subtotal:'4999.99'})],[],now).tier,'Retailer');
 assert.equal(helpers.monthlyBusinessTier([order()],[],now).tier,'Reseller');
 assert.equal(helpers.monthlyBusinessTier([order({discount:'.01'})],[],now).tier,'Retailer');
 for(const status of ['CREDITED','MANUALLY_REFUNDED','PENDING_CLAIM']){
  const r=helpers.monthlyBusinessTier([order()],[{order_id:'order-1',amount:'.01',currency:'USD',status}],now);assert.equal(r.tier,'Retailer');assert.equal(r.remaining,.01);
 }
 assert.equal(helpers.monthlyBusinessTier([order()],[{order_id:'order-1',amount:'5000',currency:'USD',status:'CANCELLED'}],now).tier,'Reseller');
});
test('India calendar month includes exact start, excludes next month, handles year change',()=>{
 const boundary=helpers.indiaMonth(now);assert.equal(boundary.start,'2026-08-31T18:30:00.000Z');assert.equal(boundary.end,'2026-09-30T18:30:00.000Z');
 assert.equal(helpers.monthlyBusinessTier([order({paid_at:'2026-08-31T18:30:00+00:00'})],[],now).spent,5000);
 assert.equal(helpers.monthlyBusinessTier([order({paid_at:'2026-09-30T18:30:00+00:00'})],[],now).spent,0);
 assert.equal(helpers.monthlyBusinessTier([order({paid_at:'2026-08-31T18:29:59Z'})],[],now).spent,0);
 assert.equal(helpers.indiaMonth(new Date('2026-12-31T19:00:00Z')).start,'2026-12-31T18:30:00.000Z');
});
test('Unpaid, cancelled, refunded, non-USD and invalid-date orders do not count',()=>{
 for(const patch of [{status:'PENDING_PAYMENT'},{status:'PAYMENT_REVIEW'},{status:'CANCELLED'},{status:'REFUNDED'},{paid_at:null},{paid_at:'garbage'},{currency:'INR'}])assert.equal(helpers.monthlyBusinessTier([order(patch)],[],now).spent,0);
 assert.equal(helpers.monthlyBusinessTier([order()],[{order_id:'order-1',amount:6000,currency:'USD',status:'CREDITED'}],now).spent,0);
});
test('Date filters use India end-of-day and CSV neutralizes formulas',()=>{
 assert.equal(helpers.dateBoundary('2026-09-28',true),'2026-09-28T18:30:00.000Z');
 assert.equal(helpers.dateBoundary('2026-02-31'),null);assert.equal(helpers.dateBoundary('invalid'),null);
 const text=helpers.csv([['=HYPERLINK("bad")',' +SUM(1)','ordinary, "quoted"']]);assert.match(text,/"'=HYPERLINK/);assert.match(text,/"' \+SUM/);assert.match(text,/ordinary, ""quoted""/);
});
const product={id:'p1',name:'Gift card',slug:'gift-card',categories:{slug:'gift'},minimum_quantity:1,maximum_quantity:10,is_bulk_order:false,product_customer_fields:[],allows_player_id_topup:false,product_type:'GIFT_CARD',delivery_type:'AUTO'};
const option={id:'o1',option_name:'USD 50',selling_price:48,denomination:50,minimum_quantity:1,maximum_quantity:10,is_active:true,is_in_stock:true,is_custom_value:false};
test('Bulk cart keeps base prices and routes products requiring details to their form',()=>{
 const cart=helpers.portalCartItem(product,option,2);assert.equal(cart.unitPrice,48);assert.equal(cart.totalPrice,96);assert.equal(cart.productOptionId,'o1');
 for(const q of [0,-1,1.5,11,NaN])assert.throws(()=>helpers.portalCartItem(product,option,q));
 assert.throws(()=>helpers.portalCartItem({...product,product_customer_fields:[{id:'f'}]},option,1),/delivery details/);
 assert.throws(()=>helpers.portalCartItem({...product,allows_player_id_topup:true},option,1));
 assert.throws(()=>helpers.portalCartItem(product,{...option,is_custom_value:true},1));
 assert.throws(()=>helpers.portalCartItem(product,{...option,is_in_stock:false},1));
});
function dataLayer({user={id:'u1',email:'OWNER@EXAMPLE.COM',email_confirmed_at:'2026-01-01'},status='APPROVED',db={}}={}){
 return load('lib/business-portal-data.ts',{'server-only':{},react:{cache:f=>f},'next/cache':{unstable_cache:f=>f},'next/navigation':{redirect:path=>{throw Error('REDIRECT:'+path)}},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user}})}})},'@/lib/supabase/admin':{createAdminClient:()=>db},'./business-verification-data':{businessApplication:async()=>status?{status,details:{legal_name:'Test'}}:null},'./business-portal':helpers});
}
test('Every portal page/export requires a verified signed-in approved business',async()=>{
 for(const params of [{user:null},{user:{id:'u1',email:'e@x.test'}},{status:null},{status:'PENDING'},{status:'REJECTED'},{status:'REVOKED'}])await assert.rejects(dataLayer(params).portalCustomer(),/REDIRECT:/);
 const c=await dataLayer().portalCustomer();assert.equal(c.email,'owner@example.com');assert.equal(c.user.id,'u1');
});
test('Order and statement queries are scoped to the authenticated customer',()=>{
 const calls=[];const q=new Proxy({}, {get:(_,name)=>(...args)=>{calls.push([name,...args]);return q;}});const data=dataLayer({db:{from:(table)=>{calls.push(['from',table]);return q;}}});
 data.customerOrders('owner@example.com',{q:'OLD_001',from:'2026-09-01',to:'2026-09-28',status:'DELIVERED'});
 assert(calls.some(c=>c[0]==='eq'&&c[1]==='customer_email'&&c[2]==='owner@example.com'));assert(calls.some(c=>c[0]==='ilike'&&c[2]==='%OLD\\_001%'));assert(calls.some(c=>c[0]==='lt'&&c[2]==='2026-09-28T18:30:00.000Z'));
 assert(calls.some(c=>c[0]==='eq'&&c[1]==='sales_channel'&&c[2]==='BUSINESS'));
 calls.length=0;data.customerStatement('user-id',{type:'DEBIT'});assert(calls.some(c=>c[0]==='eq'&&c[1]==='user_id'&&c[2]==='user-id'));assert(!calls.some(c=>c[1]==='sales_channel'),'Wallet statement spans both channels');
});
const oid='11111111-1111-4111-8111-111111111111';
function exportRoute({owner=true,status='DELIVERED'}={}){
 let codesRead=0,scoped=false;const query={select(){return this},eq(k,v){if(k==='customer_email'&&v==='owner@example.com')scoped=true;return this},async maybeSingle(){return {data:owner?{id:oid,order_number:'IP20260928123456',status,order_items:[{id:'i1',product_name:'Card',option_name:'50 USD'}]}:null,error:null}}};
 const routes=load('app/account/portal/export/route.ts',{'@/lib/business-portal-data':{portalCustomer:async()=>({user:{id:'u1'},email:'owner@example.com'})},'@/lib/business-portal':helpers,'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>query})},'@/lib/delivered-codes':{getAllDeliveredCodes:async(ids)=>{codesRead++;assert.equal(ids.join(','),'i1');return [{order_item_id:'i1',code:'SECRET-CODE'}]}}});
 return {...routes,codesRead:()=>codesRead,scoped:()=>scoped};
}
test('Code exports reject other customers, unrelated items and unpaid orders',async()=>{
 for(const config of [{owner:false},{status:'PENDING_PAYMENT'},{status:'REFUNDED'}]){const h=exportRoute(config);assert.equal((await h.GET(new Request(`http://test/export?kind=codes&order=${oid}&item=i1`))).status,404);assert.equal(h.codesRead(),0);assert(h.scoped());}
 const h=exportRoute();assert.equal((await h.GET(new Request(`http://test/export?kind=codes&order=${oid}&item=other`))).status,404);assert.equal(h.codesRead(),0);
});
test('Own delivered code export is an uncached attachment',async()=>{
 const h=exportRoute();const r=await h.GET(new Request(`http://test/export?kind=codes&order=${oid}&item=i1&format=txt`));assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'private, no-store');assert.match(r.headers.get('content-disposition'),/^attachment/);assert.equal(await r.text(),'SECRET-CODE');assert(h.scoped());
});

function pageMocks(file,overrides) {
 const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 return Object.assign(Object.fromEntries([...js.matchAll(/require\("([^"\n]+)"\)/g)].map(m=>[m[1],{}])),overrides);
}
test('Legacy B2B catalogue checks approval before any catalogue query',async()=>{
 const file='app/products/[[...collection]]/page.tsx';
 for(const approved of [false,true]){
  let checks=0,reads=0;
  const page=load(file,pageMocks(file,{'@/lib/business-portal-data':{portalCustomer:async()=>{checks++;if(!approved)throw Error('KYB required');}},'next/navigation':{redirect:path=>{throw Error('REDIRECT:'+path)},notFound:()=>{throw Error('Not found')}},'@/lib/supabase/server':{createClient:async()=>{reads++;throw Error('Unexpected public catalogue read')}}})).default;
  await assert.rejects(page({params:Promise.resolve({collection:['bulk']})}),approved?/REDIRECT:\/account\/portal\/new/:/KYB required/);assert.equal(checks,1);assert.equal(reads,0);
 }
});
test('Bulk product links require KYB for both slug and canonical rendering',async()=>{
 const file='app/product/[slug]/page.tsx';
 for(const canonicalRequest of [false,true]){
  let checks=0;const reads=[];const query={select(){return this},eq(){return this},maybeSingle:async()=>({data:{id:'bulk-product',is_bulk_order:true}})};
  const page=load(file,pageMocks(file,{'@/lib/business-portal-data':{portalCustomer:async()=>{checks++;throw Error('KYB required')}},'@/lib/supabase/server':{createClient:async()=>({from:table=>{reads.push(table);return query}})}}));
  await assert.rejects(page.renderProductPage({slug:'bulk-product',searchParams:Promise.resolve({}),canonicalRequest}),/KYB required/);assert.equal(checks,1);assert.deepEqual(reads,['products']);
 }
});

test('Retail order history is scoped to retail and the customer email',async()=>{
 const calls=[];const query=new Proxy({}, {get:(_,name)=>name==='then'?resolve=>resolve({data:[],error:null}):(...args)=>{calls.push([name,...args]);return query;}});
 const data=load('lib/customer-account-data.ts',{'server-only':{},'next/navigation':{},'@/lib/supabase/server':{},'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>query})}});
 await data.getCustomerOrders('BUYER@EXAMPLE.COM');
 assert(calls.some(c=>c[0]==='eq'&&c[1]==='customer_email'&&c[2]==='buyer@example.com'));
 assert(calls.some(c=>c[0]==='eq'&&c[1]==='sales_channel'&&c[2]==='RETAIL'));
});
test('Receipt and invoice route old owned links to their correct portal; other customers get no redirect or content',async()=>{
 for(const file of ['app/account/orders/OrderReceipt.tsx','app/account/orders/OrderInvoice.tsx'])for(const channel of ['RETAIL','BUSINESS'])for(const owner of [true,false]){
  let scoped=false;
  const db={from:table=>{const q=new Proxy({}, {get:(_,name)=>name==='then'?resolve=>resolve({data:table==='orders'?(owner?{id:'order-id',sales_channel:channel,status:'DELIVERED'}:null):[],error:null}):(...args)=>{if(table==='orders'&&name==='eq'&&args[0]==='customer_email'&&args[1]==='buyer@example.com')scoped=true;return q;}});return q;}};
  const fn=load(file,pageMocks(file,{
   'next/navigation':{redirect:href=>{throw Error('REDIRECT:'+href)},notFound:()=>{throw Error('NOT_FOUND')}},
   'i18n-iso-countries':{default:{registerLocale(){}}},'i18n-iso-countries/langs/en.json':{default:{}},
   '@/lib/customer-account-data':{requireCustomer:async()=>({user:{id:'u1',email:'buyer@example.com',email_confirmed_at:'2026-09-29'},displayName:'Buyer'})},
   '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'u1',email:'buyer@example.com',email_confirmed_at:'2026-09-29'}}})}})},
   '@/lib/supabase/admin':{createAdminClient:()=>db},
  })).default;
  const expected=channel==='BUSINESS'?'/account/portal/orders/order-id':'/account/orders/order-id';
  await assert.rejects(fn({params:Promise.resolve({id:'order-id'}),searchParams:Promise.resolve({itemId:'item-id'}),portal:channel==='RETAIL'}),e=>owner?e.message==='REDIRECT:'+expected+(file.includes('Invoice')?'/invoice?itemId=item-id':''):e.message==='NOT_FOUND');
  assert(scoped);
 }
});

test('Wallet gateway returns stay in the originating portal without crediting funds',async()=>{
 for(const gateway of ['pally','freekassa'])for(const outcome of ['success','fail'])for(const business of [true,false]){
  const token='fixture-only',orderId='11111111-1111-4111-8111-111111111111';
  const form=new FormData();form.set('InvId',orderId);form.set('MERCHANT_ORDER_ID',orderId);form.set('OutSum','25');
  form.set('SignatureValue',require('node:crypto').createHash('md5').update(`25:${orderId}:${token}`).digest('hex'));
  const query={select(){return this},eq(){return this},async maybeSingle(){return {data:{id:orderId,return_to_business:business}}}};
  const file=`app/api/${gateway}/${outcome}/route.ts`;
  const handler=load(file,pageMocks(file,{
   'node:crypto':require('node:crypto'),
   'next/server':{NextResponse:{redirect:(url,status)=>({url:String(url),status})}},
   '@/lib/pally':{getPallyApiToken:()=>token},
   '@/lib/supabase/admin':{createAdminClient:()=>({from:table=>{assert.equal(table,'wallet_topup_requests');return query;}})},
  }));
  const result=await handler.POST({url:'https://test.invalid/return',formData:async()=>form});
  assert.equal(result.status,303);assert(new URL(result.url).pathname.startsWith(business?'/account/portal/wallet':'/account/wallet'));
 }
});

test('Verified business customers can use the retail dashboard; signed-out customers still sign in',async()=>{
 const file='app/account/dashboard/page.tsx';
 for(const signedIn of [true,false]){
  const calls=[];
  const db={from:table=>{const q=new Proxy({}, {get:(_,name)=>name==='then'?resolve=>resolve({data:table==='customer_wallets'?{balance:71,currency:'USD'}:[],count:0,error:null}):(...args)=>{calls.push([table,name,...args]);return q;}});return q;}};
  const page=load(file,pageMocks(file,{
   'react/jsx-runtime':require('react/jsx-runtime'),
   './Dashboard.module.css':{default:{}},
   'next/navigation':{redirect:path=>{throw Error('REDIRECT:'+path)}},
   '@/lib/business-verification-data':{businessApplication:async()=>({status:'APPROVED'})},
   '@/lib/supabase/server':{createClient:async()=>({...db,auth:{getUser:async()=>({data:{user:signedIn?{id:'u1',email:'buyer@example.com',email_confirmed_at:'2026-09-01',user_metadata:{}}:null}})}})},
   '@/lib/supabase/admin':{createAdminClient:()=>db},
  })).default;
  if(!signedIn){await assert.rejects(page({searchParams:Promise.resolve({})}),/REDIRECT:\/account\?error=/);continue;}
  const result=await page({searchParams:Promise.resolve({})});assert.equal(result.type,'main');
  assert(calls.some(c=>c[0]==='orders'&&c[1]==='eq'&&c[2]==='sales_channel'&&c[3]==='RETAIL'));
  assert(calls.some(c=>c[0]==='customer_wallets'&&c[1]==='eq'&&c[2]==='user_id'&&c[3]==='u1'));
 }
});
