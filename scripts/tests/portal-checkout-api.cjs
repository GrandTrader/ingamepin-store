const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,console,require:name=>{if(name in mocks)return mocks[name];if(name.startsWith('node:'))return require(name);throw Error('Unexpected dependency '+name);}});return exports;}
const parser=load('lib/portal-checkout.ts');
const base={action:'confirm',paymentMethod:'wallet',requestId:'00000000-0000-4000-8000-000000000010',expectedTotal:12,items:[{productOptionId:'00000000-0000-4000-8000-000000000001',quantity:2,customValue:100,unitPrice:0.01}],reference:' MY-REF ',customer:{email:'forged@example.com'},userId:'forged-user'};
for(const method of ['pally','freekassa','usdt','binance','WALLET'])assert.throws(()=>parser.portalCheckoutInput({...base,paymentMethod:method}),/only be paid/);
for(const quantity of [0,-1,1.1,Infinity])assert.throws(()=>parser.portalCheckoutInput({...base,items:[{...base.items[0],quantity}]}),/Invalid order line/);
assert.throws(()=>parser.portalCheckoutInput({...base,expectedTotal:NaN}),/Review/);
const normalized=parser.portalCheckoutInput(base);assert.equal(normalized.reference,'MY-REF');assert.equal(normalized.items[0].unitPrice,undefined);assert.equal(normalized.customer,undefined);
let user=null,approval='PENDING',rpcResult={data:null,error:null},calls=[];
const chain={select(){return this;},eq(){return this;},async maybeSingle(){return {data:{status:approval},error:null};}};
const admin={from(table){assert.equal(table,'business_kyb');return chain;},async rpc(name,args){calls.push({name,args});return rpcResult;}};
const mocks={'@/lib/portal-checkout':parser,'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user}})}})},'@/lib/supabase/admin':{createAdminClient:()=>admin},'next/server':{NextResponse:{json:(body,options={})=>({status:options.status??200,body})}}};
for(const match of fs.readFileSync('lib/order-request-handler.ts','utf8').matchAll(/from ["'](@\/[^"']+)["']/g))mocks[match[1]]??={};
Object.assign(mocks,{'server-only':{},'@/lib/request-security':{sameOrigin:()=>true,requestLimit:async()=>null,privateJson:(body,status=200)=>({body,status})},'@/lib/trusted-client-ip':{trustedClientIp:()=> '203.0.113.10'},'@/lib/checkout-consent':{saveCheckoutConsent:async()=>{}},'@/lib/purchase-restriction-exemptions':{exemptPurchaseProducts:async()=>new Set()}});
let securityReady=true;
mocks['@/lib/business-security']={businessSessionReady:async()=>securityReady};
const {POST}=load('lib/order-request-handler.ts',mocks);
const request=body=>({json:async()=>structuredClone(body),nextUrl:{pathname:'/api/account/portal/orders'},headers:new Headers()});
(async()=>{
 assert.equal((await POST(request({...base,paymentMethod:'pally'}))).status,400);assert.equal(calls.length,0);
 assert.equal((await POST(request(base))).status,401);assert.equal(calls.length,0);
 user={id:'real-user',email:'real@example.com',app_metadata:{},user_metadata:{}};
 assert.equal((await POST(request(base))).status,401);
 user.email_confirmed_at=new Date().toISOString();user.app_metadata.wallet_disabled=true;
 assert.equal((await POST(request(base))).status,403);assert.equal(calls.length,0);
 user.app_metadata={};securityReady=false;assert.equal((await POST(request(base))).status,403);assert.equal(calls.length,0);securityReady=true;assert.equal((await POST(request(base))).status,403);assert.equal(calls[0].args.p_user,'real-user');assert.equal(calls[0].args.p_items[0].unitPrice,undefined);
 rpcResult={data:{orderId:'existing-order',orderNumber:'IPB2B20260928123456',replayed:true},error:null};
 const replay=await POST(request(base));assert.equal(replay.status,200);assert.equal(replay.body.result.orderId,'existing-order');assert(calls.every(c=>c.name==='portal_wallet_checkout'&&c.args.p_action==='recover'));
 rpcResult={data:null,error:{message:'Connection lost',code:''}};assert.equal((await POST(request(base))).status,503,'Uncertain recovery must preserve the confirmation key');
 rpcResult={data:null,error:{message:'Function missing',code:'PGRST202'}};assert.equal((await POST(request(base))).status,400);
 // Exercise full quote validation with isolated database mocks; no external requests or payments.
 let fixture,events,notifications;
 const delay=()=>new Promise(resolve=>setTimeout(resolve,5));
 admin.from=table=>{const query={select(){return this;},eq(){return this;},in(){return this;},maybeSingle(){return this;},then(resolve,reject){return Promise.resolve().then(()=>{
  events.push(table);
  if(table==='business_kyb')return {data:{status:'APPROVED'},error:null};
  if(table==='product_options')return {data:[{id:base.items[0].productOptionId,product_id:'product',denomination:100,denomination_currency:'USD',is_active:true,is_in_stock:true,minimum_quantity:1,...fixture.option}],error:null};
  if(table==='seller_product_submissions')return {data:[],error:null};
  if(table==='products')return {data:[{id:'product',name:'Test',business_enabled:true,retail_enabled:true,stock_quantity:2147483647,is_bulk_order:true,...fixture.product}],error:null};
  if(table==='product_purchase_restrictions')return {data:[],error:fixture.restrictionError?{message:'unavailable'}:null};
  throw Error('Unexpected table '+table);
 }).then(resolve,reject);}};return query;};
 admin.rpc=async(name,args)=>{events.push(args.p_action);assert.equal(name,'portal_wallet_checkout');return {data:args.p_action==='recover'?null:{total:12,...(args.p_action==='confirm'?{orderId:'fixture-order'}:{})},error:null};};
 mocks['@/lib/definiteplay-fulfillment'].supplierProductIds=async()=>{events.push('supplier:start');await delay();events.push('supplier:end');if(fixture.supplierError)throw Error('Supplier delivery setup is not ready.');return new Set();};
 mocks['@/lib/product-range-data'].productRanges=async()=>{events.push('range:start');await delay();events.push('range:end');if(fixture.rangeError)throw Error('Unable to load ranges.');return {ranges:fixture.ranges??[]};};
 mocks['@/lib/definiteplay-range-stock'].supplierRangeLimits=async ids=>new Map(ids.map(id=>[id,fixture.rangeAvailable===false?0:1000]));
 mocks['@/lib/product-range'].rangePrice=()=>{if(fixture.invalidRange)throw Error('Invalid range denomination.');return 12;};
 mocks['@/lib/product-stock'].isUnlimitedStock=n=>n===2147483647;
 mocks['@/lib/cart-stock'].quantityForOption=(items,id)=>items.filter(i=>i.productOptionId===id).reduce((n,i)=>n+i.quantity,0);
 mocks['@/lib/portal-order-notifications'].notifyPortalOrder=async()=>{notifications++;};
 async function full(action,scenario={},status=200){fixture=scenario;events=[];notifications=0;const result=await POST(request({...base,action}));assert.equal(result.status,status,JSON.stringify(result.body));assert.equal(events[0],'recover','Recovery remains first');if(status!==200)assert(!events.includes(action),'Failed validation must not reach checkout');if(action==='quote')assert.equal(notifications,0,'Quote never sends notifications');return result;}
 await full('quote');
 assert(events.indexOf('range:start')<events.indexOf('supplier:end'),'Independent preview reads overlap');
 assert(events.indexOf('range:end')<events.indexOf('quote'),'Quote waits for range checks');
 assert(events.indexOf('supplier:end')<events.indexOf('quote'),'Quote waits for supplier checks');
 await full('confirm');assert.equal(notifications,1);assert(events.indexOf('supplier:end')<events.indexOf('range:start'),'Confirmation validation remains sequential');
 for(const action of ['quote','confirm']){
  await full(action,{ranges:[{option_id:base.items[0].productOptionId,enabled:true,delivery_mode:'SUPPLIER'}]});
  await full(action,{rangeAvailable:false,ranges:[{option_id:base.items[0].productOptionId,enabled:true,delivery_mode:'SUPPLIER'}]},400);
  await full(action,{product:{business_enabled:false}},409);
  await full(action,{option:{is_active:false}},409);
  await full(action,{product:{allowed_payment_methods:['PALLY']}},400);
  await full(action,{restrictionError:true},503);
  await full(action,{invalidRange:true,ranges:[{option_id:base.items[0].productOptionId,delivery_mode:'MANUAL'}]},400);
 }
 console.log('PASS: full quote/confirmation validation, disabled channels/options, payment restrictions, range validation, purchase-limit errors, unchanged payment recovery and notifications.');
 console.log('PASS: wallet-only API, signed-in verified identity, KYB gate, discarded client prices/identity, replay before stock checks, uncertain recovery retains retry key.');
})().catch(e=>{console.error(e);process.exitCode=1;});
