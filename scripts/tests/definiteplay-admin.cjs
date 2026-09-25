const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const ts=require("typescript");
const vm=require("node:vm");
const product="11111111-1111-4111-8111-111111111111";
const option="22222222-2222-4222-8222-222222222222";
function setup({denied=false,exists=true,enabled=false}={}) {
  const calls=[];
  const chain={select(){return this;},eq(k,v){calls.push([k,v]);return this;},async maybeSingle(){return {data:exists?{id:option}:null};}};
  const exports={};
  const dependencies={
    "@/lib/definiteplay-fulfillment":{supplierProductIds:async()=>new Set(enabled?[product]:[])},
    "next/cache":{revalidatePath:p=>calls.push(["revalidate",p])},
    "@/lib/definiteplay-admin":{
      requireDefinitePlayAdmin:async()=>{calls.push(["auth"]);if(denied)throw Error("denied");return {from:()=>chain};},
      validProductId:id=>/^[0-9a-f-]{36}$/i.test(id),
    },
    "@/lib/definiteplay-relay":{
      definitePlayRequest:async(...args)=>{calls.push(["relay",...args]);return {};},
      getDefinitePlayCatalogue:async()=>({items:[],stale:false}),
    },
  };
  const code=ts.transpileModule(fs.readFileSync("app/admin/definiteplay/actions.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,require:n=>{if(!dependencies[n])throw Error(n);return dependencies[n];}});
  return {api:exports,calls};
}
test("unauthorized requests never reach supplier",async()=>{
  const {api,calls}=setup({denied:true});
  for(const run of [()=>api.refreshDefinitePlay(),()=>api.searchDefinitePlay("Apple"),()=>api.saveDefinitePlayMapping(product,option,"APPLE")])await assert.rejects(run,/denied/);
  assert.equal(calls.filter(c=>c[0]==="relay").length,0);
});
test("missing or wrong-parent option cannot be linked",async()=>{
  const {api,calls}=setup({exists:false});
  assert.ok((await api.saveDefinitePlayMapping(product,option,"APPLE")).error);
  assert.ok(calls.some(c=>c[0]==="product_id"&&c[1]===product));
  assert.equal(calls.filter(c=>c[0]==="relay").length,0);
});
test("valid mapping writes only the chosen supplier link",async()=>{
  const {api,calls}=setup();
  assert.equal((await api.saveDefinitePlayMapping(product,option,"APPLE")).success,true);
  const call=calls.find(c=>c[0]==="relay");
  assert.equal(call[1],"mapping");assert.equal(call[2].method,"PUT");
  assert.equal(call[2].body.sku,"APPLE");assert.equal(call[2].body.optionId,option);
  assert.equal(calls[0][0],"auth");
});
test("removal is scoped and malformed input rejected",async()=>{
  const {api,calls}=setup();
  assert.ok((await api.saveDefinitePlayMapping(product,option,"../order")).error);
  assert.equal((await api.saveDefinitePlayMapping(product,option,null)).success,true);
  const call=calls.find(c=>c[0]==="relay");assert.equal(call[2].method,"DELETE");
  assert.equal(call[2].body.productId,product);assert.equal(call[2].body.optionId,option);
});

test("enabled supplier links cannot be changed",async()=>{
  const {api,calls}=setup({enabled:true});
  assert.ok((await api.saveDefinitePlayMapping(product,option,"APPLE")).error);
  assert.equal(calls.filter(c=>c[0]==="relay").length,0);
});
