const test=require("node:test");
const assert=require("node:assert/strict");
const fs=require("node:fs");
const vm=require("node:vm");
const ts=require("typescript");
function load(file,deps={}) {
  const exports={};
  const code=ts.transpileModule(fs.readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText;
  vm.runInNewContext(code,{exports,Error,URLSearchParams,require:n=>{if(n in deps)return deps[n];throw Error("Unmocked "+n);}});
  return exports;
}
const logic=load("lib/definiteplay-import.ts");
const item={sku:"PSN10US",name:"PSN 10 USD",brand:"PSN",region:"USA",price:"9.30",currency:"USD",cardValue:"10",cardCurrency:"USD",stock:100,available:true,asyncOnly:false,deliveryMethod:"Code"};
const requestId="11111111-1111-4111-8111-111111111111";
const categoryId="22222222-2222-4222-8222-222222222222";
function input(extra={}) {return {requestId,categoryId,title:"PSN USA",titleRu:"",description:"",descriptionRu:"",markup:"7",options:[{sku:item.sku,expectedCost:"9.30",denomination:"10",currency:"USD"}],...extra};}
test("markup uses supplier cost with exact cent rounding",()=>{
  assert.equal(logic.priceWithMarkup("6.95","7"),"7.44");
  assert.equal(logic.priceWithMarkup("5.50","5"),"5.78");
  assert.equal(logic.priceWithMarkup("1.005","0"),"1.01");
  assert.equal(logic.prepareSupplierDraft(input(),[item]).options[0].price,9.95);
  for(const value of ["-1","NaN","1001","1.234"])assert.throws(()=>logic.priceWithMarkup("10",value));
});
test("manual selling prices override markup without changing denomination currency",()=>{
  const data=input();data.options[0].price="12.00";data.options[0].currency="INR";
  const option=logic.prepareSupplierDraft(data,[item]).options[0];
  assert.equal(option.price,12);assert.equal(option.currency,"INR");
});
test("changed quotes, mixed currencies/regions and duplicate SKUs are rejected",()=>{
  assert.throws(()=>logic.prepareSupplierDraft(input(),[{...item,price:"9.31"}]),/cost has changed/);
  assert.throws(()=>logic.prepareSupplierDraft(input(),[{...item,currency:"GBP"}]),/USD/);
  const data=input();data.options.push({...data.options[0]});
  assert.throws(()=>logic.prepareSupplierDraft(data,[item]),/only once/);
  data.options[1].sku="PSN10CA";
  assert.throws(()=>logic.prepareSupplierDraft(data,[item,{...item,sku:"PSN10CA",region:"Canada"}]),/one supplier category, region and product version/);
});
function harness({denied=false,stale=false,stock=[item],optionsFail=false,linkFail=false}={}) {
  const calls=[];let savedProduct=null;
  const chain=(table,admin)=>{
    const state={table,op:"read",filters:[]};
    const c={
      select(){return c;},eq(k,v){state.filters.push([k,v]);return c;},
      async maybeSingle(){
        if(table==="products")return {data:savedProduct,error:null};
        return {data:{id:categoryId,category_type:"GIFT_CARD"},error:null};
      },
      async insert(payload){
        assert.equal(admin,true);
        calls.push(["insert",table,payload]);
        if(table==="products"){savedProduct={id:payload.id,slug:payload.slug};return {error:null};}
        const invalidInteger=payload.some(o=>!Number.isInteger(o.denomination));
        return {error:optionsFail||invalidInteger?{code:"22P02",message:"invalid integer"}:null};
      },
    };return c;
  };
  const api=load("app/admin/definiteplay/import/actions.ts",{
    "node:crypto":require("node:crypto"),
    "next/cache":{revalidatePath:()=>{}},
    "@/lib/definiteplay-admin":{requireDefinitePlayAdmin:async()=>{calls.push(["auth"]);if(denied)throw Error("denied");return {from:t=>chain(t,false)};},validProductId:s=>/^[a-f0-9-]{36}$/.test(s)},
    "@/lib/supabase/admin":{createAdminClient:()=>({from:t=>chain(t,true)})},
    "@/lib/definiteplay-relay":{getDefinitePlayItems:async()=>({items:stock,stale}),definitePlayRequest:async(...args)=>{calls.push(["link",...args]);if(linkFail)throw Error("link failed");return {};}},
    "@/lib/definiteplay-import":logic,
    "@/lib/product-stock":{UNLIMITED_STOCK_QUANTITY:999999},
  });
  return {api,calls};
}
test("admin authorization precedes any write",async()=>{
  const {api,calls}=harness({denied:true});
  await assert.rejects(()=>api.importSupplierProduct(input()),/denied/);
  assert.equal(calls.length,1);
});
test("stale or changed supplier data cannot create a draft",async()=>{
  for(const config of [{stale:true},{stock:[{...item,price:"9.31"}]},{stock:[{...item,currency:"GBP"}]}]){
    const {api,calls}=harness(config);
    assert.ok((await api.importSupplierProduct(input())).error);
    assert.equal(calls.filter(c=>c[0]==="insert").length,0);
  }
});
test("import creates an unsellable manual draft with priced options and supplier links",async()=>{
  const {api,calls}=harness();
  assert.equal((await api.importSupplierProduct(input())).productId,requestId);
  const product=calls.find(c=>c[0]==="insert"&&c[1]==="products")[2];
  assert.equal(product.status,"DRAFT");assert.equal(product.stock_quantity,0);assert.equal(product.delivery_type,"MANUAL");
  const option=calls.find(c=>c[0]==="insert"&&c[1]==="product_options")[2][0];
  assert.equal(option.selling_price,9.95);assert.equal(option.stock_quantity,0);assert.equal(option.is_in_stock,false);
  const link=calls.find(c=>c[0]==="link");assert.equal(link[1],"mapping");assert.equal(link[2].body.sku,item.sku);
});
test("retry uses same product and never duplicates options",async()=>{
  const {api,calls}=harness();
  await api.importSupplierProduct(input());
  const retried=await api.importSupplierProduct(input());
  assert.equal(retried.productId,requestId);assert.ok(retried.warning);
  assert.equal(calls.filter(c=>c[0]==="insert"&&c[1]==="products").length,1);
  assert.equal(calls.filter(c=>c[0]==="insert"&&c[1]==="product_options").length,1);
});
test("partial failures preserve a draft and return a review warning",async()=>{
  for(const config of [{optionsFail:true},{linkFail:true}]){
    const {api}=harness(config);const result=await api.importSupplierProduct(input());
    assert.equal(result.productId,requestId);assert.ok(result.warning);
  }
});

test("import preview shows actual supplier cost and separate denomination without writes",()=>{
  const React=require("react");
  const {renderToStaticMarkup}=require("react-dom/server");
  const warning=load("components/PaypalychProductWarning.tsx",{
    "react/jsx-runtime":require("react/jsx-runtime"),
    "@/lib/paypalych-product-policy":load("lib/paypalych-product-policy.ts"),
  }).default;
  const form=load("app/admin/definiteplay/import/SupplierImportForm.tsx",{
    "@/components/PaypalychProductWarning":warning,
    "react":React,"react/jsx-runtime":require("react/jsx-runtime"),
    "next/link":()=>null,
    "@/lib/definiteplay-import":logic,
    "./category-actions":{createSupplierImportCategory:()=>{throw Error("Render must not create categories");}},
    "./actions":{importSupplierProduct:()=>{throw Error("Render must not create products");}},
  }).default;
  const html=renderToStaticMarkup(React.createElement(form,{items:[item],categories:[{id:categoryId,name:"PlayStation"}],requestId}));
  assert.match(html,/Your price \(USD\)/);
  assert.match(html,/value="9.30"/);
  assert.match(html,/value="10"/);
  assert.match(html,/Create draft product/);
  assert.match(html,/Create new category/);
});

function categoryHarness({denied=false,existing=null,race=false}={}) {
  const calls=[];let row=existing;
  const chain={
    select(){return this;},eq(){return this;},
    async maybeSingle(){return {data:row,error:null};},
    insert(payload){calls.push(payload);row={id:categoryId,...payload};return this;},
    async single(){return race?{error:{code:"23505"}}:{data:{id:row.id,name:row.name},error:null};},
  };
  const api=load("app/admin/definiteplay/import/category-actions.ts",{
    "next/cache":{revalidatePath:()=>{}},
    "@/lib/definiteplay-admin":{requireDefinitePlayAdmin:async()=>{if(denied)throw Error("denied");}},
    "@/lib/supabase/admin":{createAdminClient:()=>({from:()=>chain})},
  });
  return {api,calls};
}
test("inline category creation validates admin, name and type before writes",async()=>{
  const blocked=categoryHarness({denied:true});
  await assert.rejects(()=>blocked.api.createSupplierImportCategory("PSN","GIFT_CARD"),/denied/);
  assert.equal(blocked.calls.length,0);
  const {api,calls}=categoryHarness();
  for(const args of [["X","GIFT_CARD"],["PSN","INVALID"],["!!!","GIFT_CARD"]])assert.ok((await api.createSupplierImportCategory(...args)).error);
  assert.equal(calls.length,0);
});
test("inline creation returns category to select and reuses matching existing slug",async()=>{
  const {api,calls}=categoryHarness();
  const result=await api.createSupplierImportCategory(" PlayStation USA ","GIFT_CARD");
  assert.equal(result.category.name,"PlayStation USA");
  assert.equal(calls[0].slug,"playstation-usa");assert.equal(calls[0].category_type,"GIFT_CARD");assert.equal(calls[0].is_active,true);
  const retry=await api.createSupplierImportCategory("PlayStation USA","GIFT_CARD");
  assert.equal(retry.category.id,result.category.id);assert.equal(calls.length,1);
});
test("inactive or conflicting category is not silently changed",async()=>{
  for(const existing of [
    {id:categoryId,name:"PSN",category_type:"GIFT_CARD",is_active:false},
    {id:categoryId,name:"PSN",category_type:"GAME_KEY",is_active:true},
  ]){
    const {api,calls}=categoryHarness({existing});
    assert.ok((await api.createSupplierImportCategory("PSN","GIFT_CARD")).error);
    assert.equal(calls.length,0);
  }
});
test("concurrent category creation resolves the existing unique slug",async()=>{
  const {api}=categoryHarness({race:true});
  const result=await api.createSupplierImportCategory("PSN","GIFT_CARD");
  assert.equal(result.category.name,"PSN");
});

function importPageHarness({total=2,stale=false,selectedItem=item,selectionItems}={}) {
  const React=require("react");const calls=[];const selectionCalls=[];let renderedItems;
  const categories={select(){return this;},eq(){return this;},async order(){return {data:[{id:categoryId,name:"PSN"}]};}};
  const page=load("app/admin/definiteplay/import/page.tsx",{
    "react/jsx-runtime":require("react/jsx-runtime"),
    "next/link":({children,...props})=>React.createElement("a",props,children),
    "node:crypto":{randomUUID:()=>requestId},
    "../../AdminSidebar":()=>null,
    "@/lib/definiteplay-admin":{requireDefinitePlayAdmin:async()=>({from:()=>categories})},
    "@/lib/definiteplay-relay":{
      getDefinitePlayItems:async(skus)=>{selectionCalls.push(skus);const items=selectionItems??[selectedItem];return {items,total:items.length,stale};},
      getDefinitePlayCatalogue:async(...args)=>{calls.push(args);return {items:[{...item,sku:"PSN20US",cardValue:"20",name:"PSN 20 USD"},item],total,stale:false};},
    },
    "@/lib/definiteplay-import":logic,
    "./SupplierImportForm":({items})=>{renderedItems=items;return React.createElement("p",null,"Import preview");},
  }).default;
  return {page,calls,selectionCalls,items:()=>renderedItems};
}
test("clicking one denomination loads the authoritative category and region, ignoring narrow search",async()=>{
  const {renderToStaticMarkup}=require("react-dom/server");
  const h=importPageHarness();
  renderToStaticMarkup(await h.page({searchParams:Promise.resolve({sku:item.sku,q:"10 USD",category:"Wrong",region:"India"})}));
  assert.equal(h.calls.length,1);
  assert.equal(h.calls[0][0],"");
  assert.equal(h.calls[0][3].variant,"regular");
  assert.equal(h.calls[0][3].category,"PSN");assert.equal(h.calls[0][3].region,"USA");
  assert.equal(h.items().length,2);assert.equal(h.items()[0].cardValue,"10");
});
test("explicit single-denomination fallback still works",async()=>{
  const {renderToStaticMarkup}=require("react-dom/server");
  const h=importPageHarness();
  renderToStaticMarkup(await h.page({searchParams:Promise.resolve({sku:item.sku,single:"1"})}));
  assert.equal(h.calls.length,0);assert.equal(h.items().length,1);
});
test("oversized and stale groups cannot silently import a partial list",async()=>{
  const {renderToStaticMarkup}=require("react-dom/server");
  for(const config of [{total:51},{stale:true}]){
    const h=importPageHarness(config);
    const html=renderToStaticMarkup(await h.page({searchParams:Promise.resolve({sku:item.sku})}));
    assert.equal(h.items(),undefined);
    assert.match(html,config.stale?/out of date/:/more than 50/);
  }
});

test("supplier discount labels, not below-face-value costs, determine the version",()=>{
  assert.equal(logic.supplierProductVariant(item),"regular");
  assert.equal(logic.supplierProductVariant({...item,name:"Apple 10 USD - 2% Discount"}),"discounted");
  const data=input();data.options.push({...data.options[0],sku:"DISCOUNT"});
  assert.throws(()=>logic.prepareSupplierDraft(data,[item,{...item,sku:"DISCOUNT",name:"PSN 10 USD - 2% Discount"}]),/product version/);
});
test("discount item expands only within its own version",async()=>{
  const {renderToStaticMarkup}=require("react-dom/server");
  const h=importPageHarness({selectedItem:{...item,name:"PSN 10 USD - 2% Discount"}});
  renderToStaticMarkup(await h.page({searchParams:Promise.resolve({sku:item.sku,variant:"regular"})}));
  assert.equal(h.calls[0][3].variant,"discounted");
});


test("explicit selected items never expand to all denominations, even with conflicting SKU or filters",async()=>{
  const {renderToStaticMarkup}=require("react-dom/server");
  const selected=[item,{...item,sku:"PSN50US",cardValue:"50"}];
  const h=importPageHarness({selectionItems:selected});
  renderToStaticMarkup(await h.page({searchParams:Promise.resolve({skus:"PSN10US,PSN50US",sku:"OTHER",category:"Wrong",q:"all"})}));
  assert.equal(h.calls.length,0);assert.deepEqual(Array.from(h.selectionCalls[0]),["PSN10US","PSN50US"]);
  assert.deepEqual(h.items().map(i=>i.sku),["PSN10US","PSN50US"]);
});

test("missing selected items and invalid selections never silently import a partial or broader set",async()=>{
  const {renderToStaticMarkup}=require("react-dom/server");
  for(const skus of ["",["PSN10US","PSN50US"],"PSN10US,PSN10US","PSN10US,missing",Array.from({length:51},(_,i)=>"SKU"+i).join(",")]){
    const h=importPageHarness();
    const html=renderToStaticMarkup(await h.page({searchParams:Promise.resolve({skus})}));
    assert.equal(h.items(),undefined);assert.equal(h.calls.length,0);
    assert.match(html,/Select between|no longer in the supplier catalogue/);
  }
});

test("selected items still respect region, version and stale-data restrictions",async()=>{
  const {renderToStaticMarkup}=require("react-dom/server");
  for(const config of [
    {selectionItems:[item,{...item,sku:"OTHER",region:"UK"}]},
    {selectionItems:[item,{...item,sku:"OTHER",name:"PSN 10 USD - 2% Discount"}]},
    {selectionItems:[item,{...item,sku:"OTHER"}],stale:true},
  ]){
    const h=importPageHarness(config);const html=renderToStaticMarkup(await h.page({searchParams:Promise.resolve({skus:"PSN10US,OTHER"})}));
    assert.equal(h.items(),undefined);assert.equal(h.calls.length,0);assert.match(html,/role="alert"/);
    assert.ok(!html.includes("Import regular denominations"),"must not offer to broaden an explicit selection");
  }
});

const gamePassItems=[
  ["646026US","Essential 1M","9.99","8.64",1,9.24],
  ["646027US","Essential 3M","24.99","21.62",3,23.13],
  ["646039US","Essential 6M","39.99","34.59",6,37.01],
  ["646040US","Essential 1Y","79.99","69.19",12,74.03],
  ["646028US","Ultimate 1M","22.99","19.35",1,20.70],
  ["646029US","Ultimate 3M","68.99","58.06",3,62.12],
].map(([sku,plan,cardValue,price,months,sellingPrice])=>({...item,sku,name:"Xbox Game Pass "+plan+" US",brand:"Xbox",cardValue,price,months,sellingPrice}));

test("all six Game Pass plans import with integer durations, exact prices and separate SKU links",async()=>{
  const {api,calls}=harness({stock:gamePassItems});
  // Also covers an old browser form still sending the fractional retail values.
  const data=input({title:"Xbox Game Pass US",options:gamePassItems.map(i=>({sku:i.sku,expectedCost:i.price,denomination:i.cardValue,currency:"USD"}))});
  const result=await api.importSupplierProduct(data);
  assert.equal(result.productId,requestId);assert.equal(result.warning,undefined);
  const saved=calls.find(c=>c[0]==="insert"&&c[1]==="product_options")[2];
  assert.equal(saved.length,6);assert.equal(new Set(saved.map(o=>o.id)).size,6);
  const links=calls.filter(c=>c[0]==="link");assert.equal(links.length,6);
  saved.forEach((o,n)=>{
    assert.equal(o.denomination,gamePassItems[n].months);
    assert.equal(o.selling_price,gamePassItems[n].sellingPrice);
    assert.equal(o.option_name,gamePassItems[n].name);
    assert.equal(o.option_type,"OTHER");
    assert.equal(links[n][2].body.sku,gamePassItems[n].sku);
    assert.equal(links[n][2].body.optionId,o.id);
  });
});

test("Game Pass duration defaults do not use retail face value or alter manual prices",()=>{
  for(const i of gamePassItems)assert.equal(logic.supplierDefaultDenomination(i),String(i.months));
  assert.equal(logic.supplierDefaultDenomination(item),"10");
  assert.equal(logic.supplierDefaultDenomination({...item,cardValue:"-"}),"1");
  const i=gamePassItems[0];
  const result=logic.prepareSupplierDraft(input({options:[{sku:i.sku,expectedCost:i.price,denomination:"9.99",currency:"USD",price:"11.49"}]}),[i]);
  assert.equal(result.options[0].denomination,1);assert.equal(result.options[0].price,11.49);
  assert.equal(logic.supplierSubscriptionMonths({...item,name:"Xbox 100 USD"}),null);
});

test("fractional gift card values are rejected before any draft write, never rounded",async()=>{
  const card={...item,cardValue:"9.99"};
  assert.equal(logic.supplierDefaultDenomination(card),"9.99");
  for(const denomination of ["9.99","0","-1","NaN","1000000001"]){
    const {api,calls}=harness({stock:[card]});
    const result=await api.importSupplierProduct(input({options:[{sku:card.sku,expectedCost:card.price,denomination,currency:"USD"}]}));
    assert.match(result.error,/whole-number/);
    assert.equal(calls.filter(c=>c[0]==="insert").length,0);
  }
});

test("warnings identify option-save and supplier-link failures separately",async()=>{
  const failedOptions=harness({optionsFail:true});
  const first=await failedOptions.api.importSupplierProduct(input());
  assert.match(first.warning,/options could not be saved/);
  assert.equal(failedOptions.calls.filter(c=>c[0]==="link").length,0);
  const failedLink=harness({linkFail:true});
  const second=await failedLink.api.importSupplierProduct(input());
  assert.match(second.warning,/Draft and options saved/);
});

test("Game Pass preview shows months instead of fractional face values",()=>{
  const React=require("react");const {renderToStaticMarkup}=require("react-dom/server");
  const form=load("app/admin/definiteplay/import/SupplierImportForm.tsx",{
    "@/components/PaypalychProductWarning":()=>null,
    "react":React,"react/jsx-runtime":require("react/jsx-runtime"),"next/link":()=>null,
    "@/lib/definiteplay-import":logic,
    "./category-actions":{},"./actions":{},
  }).default;
  const html=renderToStaticMarkup(React.createElement(form,{items:gamePassItems,categories:[{id:categoryId,name:"Xbox"}],requestId}));
  assert.equal((html.match(/>Months<\/small>/g)||[]).length,6);
  assert.ok(!html.includes('value="9.99"'));
  assert.match(html,/value="12"/);assert.match(html,/value="8.64"/);
});
