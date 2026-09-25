const test=require("node:test"),assert=require("node:assert/strict");
const fs=require("node:fs"),ts=require("typescript"),vm=require("node:vm"),crypto=require("node:crypto");
function load(file,deps={}) {
 const exports={};
 const code=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,Buffer,console,process:{env:{}},require:n=>{
  if(n==="server-only")return {};
  if(n==="node:crypto")return crypto;
  if(n==="next/server")return {NextResponse:{json:(body,init={})=>({body,status:init.status??200})}};
  if(n in deps)return deps[n];throw Error(n);
 }});return exports;
}
const policy=load("lib/paypalych-product-policy.ts");
const names=["Airbnb Gift Card","Amazon Gift Card","Ebay Gift Card","Eneba Gift Card","Exxen Gift Card","Gate.io Gift Card","H&M Gift Card","Huawei Gift Card","JetonCash","Neosurf Voucher","Noon Gift Card","Openbucks Gift Card","Paysafecard","Razer Gold","Seagm Gift Card","S1LKPay Gift Card","Visa Prepaid Card","Tinder Gold","Tinder Plus","Tinder Platinum","Blu TV Subscription","Bigo Live Gift Card","Tango Live Voucher","AT&T Voucher","Base Voucher","Cashlib Voucher","Du Voucher","Etisalat Voucher","Five Voip Voucher","Flexepin Voucher","Friendi Aqua Voucher","Hello Voip Voucher","Jim Mobile Voucher","KPN Mobile Voucher","Lebara Voucher","Lucky Mobile Voucher"];
test("all merchant-listed brands match across regions, periods, casing and denominations",()=>{
 for(const n of names)for(const suffix of [" USA $50"," Turkey 12 Months"," Global 1 Month"," Россия 6 месяцев"])
  assert.ok(policy.paypalychBlockedBrand((n+suffix).toUpperCase()),n+suffix);
 for(const n of ["H & M","Gate-io","RAZER-GOLD","paysafe card","AT & T","Тиндер Плюс 12 месяцев","Visa prepaid virtual card 100 USD"])
  assert.ok(policy.paypalychBlockedBrand(n),n);
});
test("unlisted and similarly named products stay available",()=>{
 for(const n of ["Apple iTunes USA","PSN USA","Xbox Game Pass","Razer gaming mouse","Minecraft Gold","Tinder profile tips","Humble Gift Card","Steam Base Game","Dune Deluxe","Luckystar","Opensea","Amazonian Adventure","Baseball 2026"])
  assert.equal(policy.paypalychBlockedBrand(n),null,n);
});
function fakeDb(tables){return {from(table){
 const chain={select(){return this;},eq(){return this;},in(){return this;},order(){return this;},
  then(resolve,reject){return Promise.resolve(tables[table]??{data:[],error:null}).then(resolve,reject);},
  maybeSingle(){return Promise.resolve(tables[table]??{data:null,error:null});}};return chain;
}};}
function server(db){return load("lib/paypalych-product-policy-server.ts",{
 react:{cache:f=>f},"@/lib/supabase/admin":{createAdminClient:()=>db},"./paypalych-product-policy":policy
 });}
test("server checks persisted Russian names, category and denominations, fails closed on missing data",async()=>{
 const rows=[{id:"a",name:"Digital Code",name_ru:"Тиндер Голд",categories:[],product_options:[]},
 {id:"b",name:"Top up",categories:{name:"Lebara",slug:"mobile"},product_options:[]},
 {id:"c",name:"Gaming currency",categories:[],product_options:[{option_name:"Razer Gold 100"}]}];
 const db=fakeDb({products:{data:rows,error:null}});const s=server(db);
 assert.equal([...(await s.getPaypalychRestrictions(db,["a","b","c"])).values()].filter(Boolean).length,3);
 await assert.rejects(s.getPaypalychRestrictions(db,["a"]));
 const bad=fakeDb({products:{data:null,error:{message:"failed"}}});await assert.rejects(server(bad).getPaypalychRestrictions(bad,["a"]));
});
test("mixed cart hides only Paypalych while preserving other allowed gateways",async()=>{
 const db=fakeDb({products:{data:[{id:"a",allowed_payment_methods:["PALLY","USDT_DIRECT"]},{id:"b",allowed_payment_methods:["PALLY","USDT_DIRECT"]}],error:null},seller_product_submissions:{data:[],error:null},payment_gateway_settings:{data:{gateway_commissions:{}},error:null}});
 const route=load("app/api/products/payment-restrictions/route.ts",{"@/lib/supabase/admin":{createAdminClient:()=>db},"@/lib/paypalych-product-policy-server":{getPaypalychRestrictions:async()=>new Map([["a",null],["b","Razer Gold"]])}});
 const result=await route.POST({json:async()=>({productIds:["a","b"]})});
 assert.equal(result.status,200);assert.deepEqual(Array.from(result.body.allowedPaymentMethods),["USDT_DIRECT"]);
});
test("direct invoice creation blocks current names and old order snapshots before requesting a payment link",async()=>{
 const token="a".repeat(48);let supplierCalls=0;
 const deps={"@/lib/pally":{createPallyBill:async()=>{supplierCalls++;throw Error("must not run");},getUsdRubRate:async()=>{supplierCalls++;throw Error("must not run");}},"@/lib/paypalych-product-policy":policy};
 for(const snapshot of ["Razer Gold 100 USD","Generic Code"]){
  const db=fakeDb({orders:{data:{id:"order",status:"PENDING_PAYMENT",currency:"USD",access_token_hash:crypto.createHash("sha256").update(token).digest("hex")}},payments:{data:{method:"PALLY",status:"PENDING"}},order_items:{data:[{product_id:"p",product_name:snapshot,option_name:"100 USD"}],error:null}});
  const route=load("app/api/pally/create-invoice/route.ts",{...deps,"@/lib/supabase/admin":{createAdminClient:()=>db},"@/lib/paypalych-product-policy-server":{getPaypalychRestrictions:async()=>new Map([["p",snapshot==="Generic Code"?"Amazon":null]])}});
  const result=await route.POST({json:async()=>({orderId:"order",accessToken:token})});
  assert.equal(result.status,400);assert.match(result.body.error,/Paypalych is unavailable/);
 }
 assert.equal(supplierCalls,0);
});
test("forged product names cannot bypass the order check for a restricted denomination",async()=>{
 let mutations=0;
 const db=fakeDb({product_options:{data:[{id:"opt",product_id:"real-product"}],error:null}});
 db.rpc=async()=>{mutations++;throw Error("must not create order");};
 const route=load("app/api/orders/route.ts",{
 "@/lib/paypalych-product-policy-server":{getPaypalychRestrictions:async(_,ids)=>{assert.ok(ids.includes("real-product"));return new Map([["real-product","Razer Gold"]]);}},
 "@/lib/paypalych-product-policy":policy,
 "@/lib/supabase/admin":{createAdminClient:()=>db},
 "@/lib/supabase/server":{createClient:async()=>({auth:{getUser:async()=>({data:{user:null}})}})},
 "@/lib/email":{},"@/lib/manual-fulfillment":{},"@/lib/cart-stock":{},"@/lib/product-stock":{},"@/lib/definiteplay-fulfillment":{},"@/lib/telegram-order-notification":{},"@/lib/payment-gateway-commissions":{}
 });
 const result=await route.POST({json:async()=>({paymentMethod:"pally",customer:{email:"test@example.com"},items:[{productOptionId:"opt",name:"Apple",quantity:1}]}),headers:{get:()=>null}});
 assert.equal(result.status,400);assert.match(result.body.error,/Paypalych is unavailable/);assert.equal(mutations,0);
});
