const test=require("node:test"), assert=require("node:assert/strict");
const fs=require("node:fs"), ts=require("typescript"), vm=require("node:vm");
function load(file,deps,extra={}) {
 const exports={};
 const code=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,Date,Set,Map,process:{env:{}},require:n=>{if(n==="server-only")return {};if(!(n in deps))throw Error(n);return deps[n];},...extra});
 return exports;
}
test("supplier mode blocks stock access when DB fails and stale quantities are unavailable",async()=>{
 let row={available_quantity:20,unit_cost:9,synced_at:new Date().toISOString()},error=null,calls=0;
 const chain={select(){return this;},eq(){return this;},async maybeSingle(){calls++;return {data:row,error};}};
 const api=load("lib/definiteplay-fulfillment.ts",{"@/lib/supabase/admin":{createAdminClient:()=>({from:()=>chain})}});
 assert.equal((await api.supplierProductIds(["x"])).size,0);
 assert.equal(calls,0,"feature off does not depend on new schema");
 assert.equal(await api.supplierAvailableQuantity("x"),20);
 row={...row,synced_at:new Date(Date.now()-16*60000).toISOString()};
 assert.equal(await api.supplierAvailableQuantity("x"),0);
 row={...row,synced_at:"invalid"};
 assert.equal(await api.supplierAvailableQuantity("x"),0);
 error={message:"db error"};
 await assert.rejects(api.supplierAvailableQuantity("x"));
});
test("manual preparation never releases supplier codes or reopens a completed supplier order",async()=>{
 const calls=[];
 const client={from(table) {
   const chain={select(){return this;},eq(){return this;},in(){return this;},update(data){calls.push([table,data]);return this;},
     then(resolve){resolve({data:table==="order_items"?[{id:"supplier",products:{delivery_type:"MANUAL"}}]:[{item_id:"supplier"}]});},
     async single(){return {data:{id:"order",status:"DELIVERED"}};}};
   return chain;
 }};
 const api=load("lib/manual-fulfillment.ts",{
   "@/lib/supabase/admin":{createAdminClient:()=>client},
   "@/lib/definiteplay-fulfillment":{supplierDeliveryEnabled:()=>true}});
 assert.equal((await api.prepareOrderForManualFulfillment("order")).status,"DELIVERED");
 assert.equal(calls.length,0);
});
test("admin activation requires authorization and healthy worker before any database mutation",async()=>{
 let denied=true,ready=false,enabled=true;
 const calls=[];
 const deps={
   "next/cache":{revalidatePath(){}},
   "@/lib/definiteplay-admin":{requireDefinitePlayAdmin:async()=>{if(denied)throw Error("denied");},validProductId:()=>true},
   "@/lib/definiteplay-fulfillment":{supplierDeliveryEnabled:()=>enabled},
   "@/lib/definiteplay-relay":{getDefinitePlayMappings:async()=>({mappings:[{option_id:"o",sku:"sku",supplier:{currency:"USD"}}]}),getDefinitePlayStatus:async()=>({fulfillmentReady:ready,stale:false})},
   "@/lib/supabase/admin":{createAdminClient:()=>({rpc:async(...args)=>{calls.push(args);return {error:null};}})}
 };
 const api=load("app/admin/definiteplay/fulfillment-actions.ts",deps);
 await assert.rejects(api.configureSupplierDelivery("product",true));
 assert.equal(calls.length,0);
 denied=false;
 assert.ok((await api.configureSupplierDelivery("product",true)).error);
 assert.equal(calls.length,0);
 ready=true;
 assert.equal((await api.configureSupplierDelivery("product",true)).success,true);
 assert.equal(calls.length,1);
 enabled=false;
 assert.ok((await api.configureSupplierDelivery("product",true)).error);
 assert.equal(calls.length,1);
});

test("cart quantity check uses fresh supplier availability and preserves owned inventory",async()=>{
 let supplier=true,available=7,ownedQueries=0;
 const product={id:"p",status:"ACTIVE",stock_quantity:99,minimum_quantity:1,maximum_quantity:10};
 const option={id:"o",product_id:"p",is_active:true,is_in_stock:true};
 const client={from(table){
  const chain={select(){return this;},eq(){return this;},in(){return this;},then(resolve){
   if(table==="gift_card_codes")ownedQueries++;
   resolve({data:table==="products"?[product]:table==="product_options"?[option]:[],count:3,error:null});
  }};
  return chain;
 }};
 const api=load("app/api/products/quantity-limits/route.ts",{
  "next/server":{NextResponse:{json:(body,options)=>({body,...options})}},
  "@/lib/product-stock":{UNLIMITED_STOCK_QUANTITY:2147483647},
  "@/lib/supabase/admin":{createAdminClient:()=>client},
  "@/lib/definiteplay-fulfillment":{supplierProductIds:async()=>new Set(supplier?["p"]:[]),supplierAvailableQuantity:async()=>available}
 });
 const request={json:async()=>({items:[{productId:"p",productOptionId:"o"}]})};
 assert.equal((await api.POST(request)).body.limits[0].availableQuantity,7);
 assert.equal(ownedQueries,0);
 available=0;
 assert.equal((await api.POST(request)).body.limits[0].availableQuantity,0);
 supplier=false;
 assert.equal((await api.POST(request)).body.limits[0].availableQuantity,3);
 assert.equal(ownedQueries,1);
});
