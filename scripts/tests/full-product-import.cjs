const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const ts = require("typescript");
function load(path, deps = {}) {
  const mod = {exports:{}};
  const code = ts.transpileModule(fs.readFileSync(path,"utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  new Function("exports","require","module",code)(mod.exports, name => {
    if (name in deps) return deps[name];
    throw new Error("Unexpected dependency: " + name);
  },mod);
  return mod.exports;
}
const stock = load("lib/product-stock.ts");
const api = load("lib/full-product-import.ts", {"./product-stock":stock});
const {parseFullProductCsv:parse,fullProductTemplate,resolveImportCategory,PRODUCT_IMPORT_COLUMNS:cols} = api;
const category = {id:"cat-1",name:"Gift cards",slug:"gift-cards",category_type:"GIFT_CARD"};
const encode = value => '"' + String(value ?? "").replaceAll('"','""') + '"';
function csv(rows = [{}], separator = ",") {
  return "\uFEFF" + [cols,...rows.map((row,i) => cols.map(key => ({
    ...(i === 0 ? {title_en:"Razer Gold",title_ru:"Подарочная карта",description_en:'Gaming, "digital"\nSecond line 🎮',description_ru:"Цифровая доставка\nВыберите номинал",category_slug:"gift-cards"} : {}),
    denomination:String(i+1),price:((i+1)*1.08).toFixed(2),...row
  })[key] ?? ""))].map(row=>row.map(encode).join(separator)).join("\r\n");
}
test("multiline bilingual UTF-8 descriptions, quotes and repeated product details survive import",()=>{
  const p=parse(csv([{}, {title_en:"Razer Gold"}]));
  assert.equal(p.descriptionEn,'Gaming, "digital"\nSecond line 🎮');
  assert.equal(p.descriptionRu,"Цифровая доставка\nВыберите номинал");
  assert.equal(p.titleRu,"Подарочная карта"); assert.equal(p.options[1].price,2.16);
  assert.equal(p.slug,"razer-gold");
});
test("downloadable template imports with both languages and two options",()=>{
  const template=fullProductTemplate();
  assert.equal(template.replace(/^\uFEFF/, "").split(/\r?\n/)[0], "name,denomination,price,title_en,title_ru,description_en,description_ru");
  const p=parse(template);
  assert.equal(p.options.length,2); assert.equal(p.categorySlug,"");
  assert.equal(resolveImportCategory(p,[category],"cat-1").id,"cat-1");
  assert.equal(p.titleRu,"Пример подарочной карты");
});
test("semicolon and tab files preserve decimal prices",()=>{
  for(const sep of [";","\t"]) assert.equal(parse(csv([{}],sep)).options[0].price,1.08);
});
test("all fourteen Razer denominations retain MRP without adding markup",()=>{
  const values=[1,2,5,10,15,20,25,30,50,100,200,300,400,500];
  const p=parse(csv(values.map(n=>({denomination:String(n),price:n.toFixed(2)}))));
  assert.deepEqual(p.options.map(o=>o.price),values);
});
test("invalid or ambiguous values cannot become zero or truncated amounts",()=>{
  for(const price of ["","-1","1e2","Infinity","NaN","1.234","1,08","10000000000"]) assert.throws(()=>parse(csv([{price}])),/price/);
  for(const denomination of ["","0","-1","1.5","2147483648"]) assert.throws(()=>parse(csv([{denomination}])),/denomination/);
  assert.equal(parse(csv([{price:"0"}])).options[0].price,0);
});
test("different products, duplicate denominations and malformed files are rejected",()=>{
  assert.throws(()=>parse(csv([{}, {title_en:"Another product"}])),/one product/);
  assert.throws(()=>parse(csv([{}, {denomination:"1"}])),/unique|once/);
  assert.throws(()=>parse('title_en,denomination,price\n"unclosed,1,1'),/not closed/);
  assert.throws(()=>parse('title_en,denomination,price\nName,1'),/columns/);
  assert.throws(()=>parse('title_en,denomination,price,price\nName,1,1,1'),/duplicate/);
  assert.throws(()=>parse('title_en,denomination,price,random\nName,1,1,x'),/Unknown/);
});
test("stock flags, automatic inventory and bulk delivery are validated",()=>{
  const p=parse(csv([{stock_quantity:"unlimited",is_in_stock:"false"}]));
  assert.equal(p.options[0].stockQuantity,2147483647); assert.equal(p.options[0].isInStock,false);
  assert.throws(()=>parse(csv([{delivery_type:"AUTOMATIC",stock_quantity:"1"}])),/actual codes/);
  assert.throws(()=>parse(csv([{is_bulk_order:"true"}])),/delivery instructions/);
  assert.throws(()=>parse(csv([{is_in_stock:"maybe"}])),/true or false/);
  assert.throws(()=>parse(csv([{stock_quantity:"2147483646"},{stock_quantity:"2"}])),/Combined stock/);
});
test("size and row limits apply before saving",()=>{
  assert.throws(()=>parse("x".repeat(api.MAX_PRODUCT_IMPORT_BYTES+1)),/512 KB/);
  assert.throws(()=>parse(csv(Array.from({length:51},()=>({})))),/50 denominations/);
  assert.equal(parse(csv(Array.from({length:50},()=>({})))).options.length,50);
});
test("category in file is authoritative; blank category uses selection",()=>{
  const p=parse(csv());
  assert.equal(resolveImportCategory(p,[category],"invalid").id,category.id);
  assert.throws(()=>resolveImportCategory(p,[],"cat-1"),/not found/);
  assert.equal(resolveImportCategory({...p,categorySlug:""},[category],"cat-1").id,category.id);
  assert.throws(()=>resolveImportCategory(p,[{...category,category_type:"UNKNOWN"}],""),/unsupported/);
});
function actionFixture(config={}) {
  const writes=[]; const invalidations=[];
  const session={auth:{getUser:async()=>({data:{user:config.noUser?null:{id:"admin"}}})},from(table){
    const chain={select(){return chain},eq(){return chain},
      async maybeSingle(){return {data:config.noAdmin?null:{user_id:"admin"}}},
      then(resolve,reject){return Promise.resolve({data:config.noCategories?[]:[category],error:null}).then(resolve,reject)}
    };return chain;
  }};
  const admin={from(table){
    let operation; const chain={
      insert(values){operation="insert";writes.push({table,operation,values});return chain},
      select(){return chain},eq(){return chain},
      delete(){operation="delete";writes.push({table,operation});return chain},
      async single(){return config.duplicate ? {error:{code:"23505"},data:null} : {data:{id:"new-draft"},error:null}},
      then(resolve,reject){return Promise.resolve({error:
        table==="product_options" && config.optionsFail || operation==="delete" && config.cleanupFail ? {message:"failure"} : null
      }).then(resolve,reject)}
    };return chain;
  }};
  const {importFullProduct} = load("app/admin/products/import/actions.ts", {
    "next/cache":{revalidatePath:p=>invalidations.push(p)},
    "@/lib/supabase/admin-session":{createClient:async()=>session},
    "@/lib/supabase/admin":{createAdminClient:()=>admin},
    "@/lib/full-product-import":api,
    "@/lib/product-stock":stock,
  });
  return {run:importFullProduct,writes,invalidations};
}
test("unauthorized, invalid CSV and missing category requests produce no writes",async()=>{
  for(const config of [{noUser:true},{noAdmin:true},{noCategories:true}]) {
    const f=actionFixture(config); assert.ok((await f.run(csv(),"")).error); assert.equal(f.writes.length,0);
  }
  const f=actionFixture(); assert.ok((await f.run("bad","")).error); assert.equal(f.writes.length,0);
});
test("server creates one bilingual draft and inserts all numeric options in a batch",async()=>{
  const f=actionFixture(); const r=await f.run(csv([{currency:"INR",stock_quantity:"5"},{currency:"INR",stock_quantity:"8",is_in_stock:"false"}]),"");
  assert.equal(r.productId,"new-draft"); assert.equal(f.writes.length,2);
  const p=f.writes[0].values;
  assert.equal(p.status,"DRAFT"); assert.equal(p.name_ru,"Подарочная карта"); assert.equal(p.currency,"USD");
  assert.equal(p.stock_quantity,5); assert.equal(p.category_id,"cat-1");
  assert.equal(f.writes[1].values.length,2);
  assert.equal(f.writes[1].values[0].denomination_currency,"INR");
  assert.equal(f.writes[1].values[0].selling_price,1.08);
  assert.deepEqual(f.invalidations,["/admin/products"]);
});
test("failed options are cleaned up; failed cleanup exposes the draft identity",async()=>{
  const f=actionFixture({optionsFail:true});
  assert.ok((await f.run(csv(),"")).error); assert.equal(f.writes.at(-1).operation,"delete");
  assert.equal(f.invalidations.length,0);
  const g=actionFixture({optionsFail:true,cleanupFail:true});
  assert.match((await g.run(csv(),"")).error,/new-draft.*Review/);
});
test("duplicate slugs never overwrite existing products or insert more options",async()=>{
  const f=actionFixture({duplicate:true}); const r=await f.run(csv(),"");
  assert.match(r.error,/already exists/); assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].operation,"insert");
});

