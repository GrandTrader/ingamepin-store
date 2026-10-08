const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={},globals={}) {
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(n in mocks)return mocks[n];throw Error('Missing mock '+n)},Date,Intl,Map,Set,URL,Response,console,process:{env:{AFFILIATE_HASH_SECRET:'test-only-secret'}},...globals},{filename:file});return exports;
}
const logic=load('lib/product-promotions.ts'),id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),now=Date.now(),future=new Date(now+86400000).toISOString(),past=new Date(now-86400000).toISOString();
const rule=(optionId,percent,endsAt=future)=>({optionId,percent,endsAt});
test('Per-option overrides, off and expiry replace product default',()=>{
 assert.equal(logic.activePromotion([rule(null,10)],id(2),now).percent,10);
 assert.equal(logic.activePromotion([rule(null,10),rule(id(2),30)],id(2),now).percent,30);
 for(const override of [rule(id(2),0,null),rule(id(2),30,past),rule(id(2),30,new Date(now).toISOString())])assert.equal(logic.activePromotion([rule(null,10),override],id(2),now),null);
});
test('India date conversion is strict and reversible',()=>{
 const input='2026-10-22T04:29';assert.equal(logic.fromIndiaInput(input),'2026-10-21T22:59:00.000Z');assert.equal(logic.toIndiaInput(logic.fromIndiaInput(input)),input);
 for(const invalid of ['2026-02-30T12:00','2026-01-01T25:00','2026-01-01','invalid'])assert.throws(()=>logic.fromIndiaInput(invalid));
});
test('Discount configuration rejects unsafe values, duplicates and missing expiry',()=>{
 for(const invalid of [[rule(null,100)],[rule(null,-1)],[rule(null,1.234)],[rule(null,Infinity)],[rule(null,'')],[rule(null,5,null)],[rule('invalid',10)],[rule(null,10),rule(null,20)]])assert.throws(()=>logic.parsePromotionRules(invalid,now));
 assert.equal(logic.parsePromotionRules([rule(null,20,past)],now)[0].endsAt,past,'Unchanged expired rules can be retained');
});
test('Larger discount wins, cents round like checkout, product cards use the cheapest effective option',()=>{
 assert.equal(logic.promotionLineTotal(100,20,10),80);assert.equal(logic.promotionLineTotal(100,20,30),70);
 assert.equal(logic.promotionLineTotal(1.05,0,10),.94);assert.equal(logic.discountedPrice(1.01,50),.51);assert.equal(logic.discountedPrice(.01,99.99),.01);
 const options=[{price:100,percent:50,endsAt:future},{price:75,percent:0,endsAt:null}];
 assert.equal(logic.cardPromotionPrice(options,75,0,now).price,50);
 assert.equal(logic.cardPromotionPrice(options,75,0,now+86400001).price,75);
 assert.equal(logic.cardPromotionPrice(options,75,60,now).price,30);
});
function priceRoute({sale=20,range=null,cookies=false,origin=true,unavailable=false}={}) {
 const queries=[];const query=(table)=>{const q={select(){return q},in(){return q},eq(k,v){queries.push([table,k,v]);return q},maybeSingle:async()=>({data:table==='affiliate_clicks'?{affiliate_id:id(5),product_id:id(1),created_at:new Date().toISOString()}:table==='affiliate_settings'?{program_enabled:true,cookie_days:7}:table==='affiliate_accounts'?{commission_override_percent:null}:{commission_percent:3}}),then(resolve){resolve({data:unavailable?[]:[{id:id(2),product_id:id(1),selling_price:100,is_custom_value:!!range,products:{id:id(1),status:'ACTIVE',retail_enabled:true,business_enabled:true,affiliate_enabled:true,affiliate_commission_percent:3}}]})}};return q};
 const route=load('app/api/products/prices/route.ts',{'node:crypto':require('node:crypto'),'next/server':require('next/server'),'@/lib/supabase/admin':{createAdminClient:()=>({from:query})},'@/lib/request-security':{sameOrigin:()=>origin,requestLimit:async()=>null,privateJson:(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'private, no-store'}})},'@/lib/product-promotion-data':{productPromotions:async()=>({ready:true,rows:[{product_id:id(1),rules:[rule(null,sale)]}]})},'@/lib/product-range-data':{productRanges:async()=>({ranges:range?[range]:[]})},'@/lib/product-range':load('lib/product-range.ts'),'@/lib/product-promotions':logic});
 const call=async(items=[{productOptionId:id(2)}])=>route.POST({text:async()=>JSON.stringify({items}),cookies:{get:n=>cookies?{value:n==='igp_affiliate_click'?id(4):'visitor'}:undefined}});
 return {call,queries};
}
test('Current-price API computes sale and affiliate prices from trusted data',async()=>{
 const r=priceRoute({cookies:true});const response=await r.call();assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);const data=await response.json();
 assert.equal(data.prices[0].price,82.4);assert.equal(data.prices[0].regularPrice,103);assert.equal(data.prices[0].expectedSaleUnitPrice,80);
 assert(r.queries.some(q=>q[0]==='affiliate_settings'&&q[1]==='id'&&q[2]===1));
});
test('Current-price API handles custom ranges and rejects invalid requests',async()=>{
 const range={option_id:id(2),enabled:true,currency:'INR',minimum:100,maximum:10000,step:1,price_basis:100,price_usd:1.08};
 const response=await priceRoute({range}).call([{productOptionId:id(2),customValue:1000,price:.01}]);assert.equal((await response.json()).prices[0].price,8.64);
 assert.equal((await priceRoute({range}).call([{productOptionId:id(2),customValue:99}])).status,400);
 assert.equal((await priceRoute({unavailable:true}).call()).status,400);
 assert.equal((await priceRoute({origin:false}).call()).status,403);
 assert.equal((await priceRoute().call([{productOptionId:'not-a-uuid'}])).status,400);
});
test('Cart refresh preserves identity, quantity and details and rejects misordered quotes',async()=>{
 const items=[{id:'cart-a',productOptionId:id(2),quantity:3,price:100,customerInformation:[{value:'reference-only'}]}];
 const cart=load('lib/cart-prices.ts',{}, {fetch:async()=>Response.json({prices:[{index:0,productOptionId:id(2),price:80,salePercent:20,expectedSaleUnitPrice:80}]})});
 const result=await cart.refreshCartPrices(items);assert.equal(result[0].quantity,3);assert.equal(result[0].totalPrice,240);assert.equal(result[0].customerInformation,items[0].customerInformation);assert(cart.pricesChanged(items,result));
 const bad=load('lib/cart-prices.ts',{}, {fetch:async()=>Response.json({prices:[{index:0,productOptionId:id(3),price:80}]})});await assert.rejects(bad.refreshCartPrices(items),/verify/);
});
test('Catalogue pagination includes more than 1000 options and range minimum',async()=>{
 const all=Array.from({length:1200},(_,n)=>({id:id(n+10),product_id:id(1),selling_price:n+1,is_custom_value:false}));all.push({id:id(2),product_id:id(1),is_custom_value:true});
 const reads=[];const db={from(table){let from=0,to=499;const q={select(){return q},in(){return q},eq(){return q},order(){return q},range(a,b){from=a;to=b;reads.push([a,b]);return q},then(resolve){resolve({data:table==='product_promotions'?[{product_id:id(1),rules:[rule(null,10)]}]:all.slice(from,to+1)})}};return q}};
 const data=load('lib/product-promotion-data.ts',{'server-only':{},'@/lib/supabase/admin':{createAdminClient:()=>db},'./product-promotions':logic,'./product-range':load('lib/product-range.ts'),'./product-range-data':{productRanges:async()=>({ranges:[{option_id:id(2),enabled:true,minimum:100,maximum:1000,step:1,price_basis:100,price_usd:2}]})}});
 const result=await data.cataloguePromotions([id(1)]);assert.equal(result.get(id(1)).length,1201);assert.equal(result.get(id(1)).at(-1).price,2);assert.equal(reads.length,3);
});
