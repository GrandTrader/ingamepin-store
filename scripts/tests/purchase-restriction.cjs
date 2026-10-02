const test=require("node:test"),assert=require("node:assert/strict"),fs=require("node:fs"),ts=require("typescript");
function load(file,imports={}){const mod={exports:{}};new Function("exports","require","module",ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText)(mod.exports,n=>n in imports?imports[n]:require(n),mod);return mod.exports;}
const periods=load("lib/purchase-restriction.ts");
const {exemptPurchaseProducts}=load("lib/purchase-restriction-exemptions.ts");
test("daily, weekly and monthly windows preserve UTC time across year/leap boundaries",()=>{
 const now=new Date("2024-03-01T05:30:15.200Z");
 assert.equal(periods.purchaseLimitSince("ROLLING_1_DAY",now).toISOString(),"2024-02-29T05:30:15.200Z");
 assert.equal(periods.purchaseLimitSince("ROLLING_7_DAYS",now).toISOString(),"2024-02-23T05:30:15.200Z");
 assert.equal(periods.purchaseLimitSince("ROLLING_30_DAYS",now).toISOString(),"2024-01-31T05:30:15.200Z");
 assert.equal(periods.purchaseLimitSince("ROLLING_7_DAYS",new Date("2026-01-02T12:00:00Z")).toISOString(),"2025-12-26T12:00:00.000Z");
 assert.equal(now.toISOString(),"2024-03-01T05:30:15.200Z");
 assert.throws(()=>periods.purchaseLimitSince("UNKNOWN"));
});
test("legacy calendar weeks still start on Monday UTC",()=>{
 assert.equal(periods.purchaseLimitSince("CALENDAR_WEEK",new Date("2026-10-04T23:59:59Z")).toISOString(),"2026-09-28T00:00:00.000Z");
 assert.equal(periods.purchaseLimitSince("CALENDAR_WEEK",new Date("2026-10-05T00:00:00Z")).toISOString(),"2026-10-05T00:00:00.000Z");
});
test("guest checkout cannot claim an exemption through a supplied email",async()=>{
 assert.deepEqual(await exemptPurchaseProducts({from(){throw Error("Must not query");}},null,["p"]),new Set());
});
test("exemptions are queried by authenticated account and selected products",async()=>{
 const trace=[];const admin={from(t){assert.equal(t,"product_purchase_restriction_exemptions");return{select(){return this;},eq(k,v){trace.push([k,v]);return this;},async in(k,v){trace.push([k,v]);return{data:[{product_id:"p1"}],error:null};}};}};
 assert.deepEqual(await exemptPurchaseProducts(admin,"signed-in-id",["p1","p2"]),new Set(["p1"]));
 assert.deepEqual(trace,[["user_id","signed-in-id"],["product_id",["p1","p2"]]]);
});
test("database failure blocks exemptions; pre-migration schema grants no bypass",async()=>{
 const db=code=>({from:()=>({select(){return this},eq(){return this},in:async()=>({error:{code}})})});
 await assert.rejects(exemptPurchaseProducts(db("08006"),"u",["p"]),/Unable to verify/);
 assert.deepEqual(await exemptPurchaseProducts(db("PGRST205"),"u",["p"]),new Set());
});
const productId="00000000-0000-4000-8000-000000000001",userId="00000000-0000-4000-8000-000000000002";
function harness({authorized=true,found=true}={}){
 const writes=[],deletes=[],pages=[];const exemptions=new Map();
 const admin={auth:{admin:{listUsers:async({page})=>{pages.push(page);return{data:{users:found?[{id:userId,email:"Buyer@Example.com"}]:[]},error:null}}}},from(table){let filters={};return{
 select(){return this},eq(k,v){filters[k]=v;return this},limit(){return Promise.resolve({data:[{id:productId}],error:null})},
 maybeSingle:async()=>({data:{id:productId},error:null}),
 upsert:async(row)=>{writes.push({table,row});exemptions.set(row.product_id+":"+row.user_id,row);return{error:null}},
 delete(){return {eq(k,v){filters[k]=v;return this},then(resolve){deletes.push({...filters});exemptions.delete(filters.product_id+":"+filters.user_id);resolve({error:null});}}}
 };}};
 const session={auth:{getUser:async()=>({data:{user:{id:"admin"}}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:authorized?{user_id:"admin"}:null})})};
 const actions=load("app/admin/products/[id]/edit/restrictions/actions.ts",{
 "@/lib/purchase-restriction":periods,"@/lib/purchase-restriction-currencies":{isRestrictionCurrency:()=>true},"@/lib/paypalych-product-policy-server":{getProductPaypalychRestriction:async()=>false},
 "next/cache":{revalidatePath:()=>{}},"next/navigation":{redirect:url=>{throw Error("REDIRECT "+url)}},
 "@/lib/supabase/admin":{createAdminClient:()=>admin},"@/lib/supabase/admin-session":{createClient:async()=>session}
 });
 return {actions,writes,deletes,pages,exemptions};
}
function form(values){const f=new FormData();for(const[k,v]of Object.entries(values))f.set(k,v);return f;}
test("admin can exempt a registered mixed-case email, repeat safely, and restore restriction",async()=>{
 const h=harness();const f=form({product_id:productId,customer_email:"  BUYER@example.COM  "});
 for(let i=0;i<2;i++)await assert.rejects(h.actions.exemptCustomerFromPurchaseRestriction(f),/success=/);
 assert.equal(h.exemptions.size,1);assert.equal(h.writes[0].row.user_id,userId);
 await assert.rejects(h.actions.restoreCustomerPurchaseRestriction(form({product_id:productId,user_id:userId})),/success=/);
 assert.equal(h.exemptions.size,0);assert.deepEqual(h.deletes,[{product_id:productId,user_id:userId}]);
});
test("unregistered or malformed emails cannot create exemptions",async()=>{
 for(const email of ["not-an-email","missing@example.com"]){const h=harness({found:false});await assert.rejects(h.actions.exemptCustomerFromPurchaseRestriction(form({product_id:productId,customer_email:email})),/error=/);assert.equal(h.writes.length,0);}
});
test("non-admin cannot add or remove an exemption",async()=>{
 const h=harness({authorized:false});for(const action of [h.actions.exemptCustomerFromPurchaseRestriction,h.actions.restoreCustomerPurchaseRestriction])await assert.rejects(action(form({product_id:productId,user_id:userId,customer_email:"buyer@example.com"})),/Access denied/);
 assert.equal(h.writes.length+h.deletes.length+h.pages.length,0);
});
test("unsupported reset periods are rejected before settings are changed",async()=>{
 const h=harness();await assert.rejects(h.actions.saveProductRestriction(form({id:productId,minimum_quantity:"1",weekly_limit:"100",payment_method_WALLET:"on",reset_mode:"FOREVER"})),/valid reset period/);assert.equal(h.writes.length,0);
});
