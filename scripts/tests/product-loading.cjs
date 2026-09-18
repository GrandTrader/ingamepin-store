const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
function run(canonicalRequest=true){
 const calls=[];let release;const gate=new Promise(r=>release=r);
 const product={id:'p',public_id:123456789,name:'Product',slug:'product',categories:{slug:'games',name:'Games',public_id:987654321},affiliate_enabled:true,affiliate_commission_percent:5};
 const client={from(table){const q={table,filters:[]};const b={};for(const method of ['select','eq','in','order','limit','maybeSingle'])b[method]=(...args)=>{q.filters.push([method,...args]);return b};b.then=(yes,no)=>{calls.push(q);return(table==='products'?Promise.resolve({data:product,error:null}):gate.then(()=>({data:table==='affiliate_settings'?{program_enabled:false}:table==='seller_product_submissions'?null:[],error:null}))).then(yes,no)};return b}};
 const mod={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/product/[slug]/page.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{module:mod,exports:mod.exports,require(name){
 if(name==='react/jsx-runtime')return require(name);
 if(name==='next/navigation')return{notFound(){throw Error('404')},permanentRedirect(url){throw Error('REDIRECT:'+url)}};
 if(name==='@/lib/supabase/server')return{createClient:async()=>client};
 if(name==='@/lib/supabase/admin')return{createAdminClient:()=>client};
 if(name==='@/lib/customer-discounts')return{getSignedInCustomerDiscounts:()=>{calls.push({table:'discounts'});return gate.then(()=>new Map())}};
 if(name==='@/lib/product-url')return{getProductUrl:()=>'/canonical'};
 if(name==='@/lib/product-stock')return{isUnlimitedStock:()=>false};
 return {__esModule:true,default:()=>null};
 }});
 return{calls,release,result:mod.exports.renderProductPage({slug:'product',searchParams:Promise.resolve({}),canonicalRequest})};
}
test('product independent queries start together and review lookup is bounded',async()=>{
 const r=run();await new Promise(resolve=>setImmediate(resolve));
 for(const table of ['product_options','product_customer_fields','order_reviews','digiseller_reviews','order_items','discounts','affiliate_settings'])assert(r.calls.some(q=>q.table===table),table);
 const review=r.calls.find(q=>q.table==='order_reviews');assert(review.filters.some(f=>f[0]==='eq'&&f[1]==='orders.order_items.product_id'&&f[2]==='p'));assert(review.filters.some(f=>f[0]==='limit'&&f[1]===50));
 r.release();await r.result;
});
test('legacy URLs redirect before loading reviews, options, or customer data',async()=>{
 const r=run(false);await assert.rejects(r.result,/REDIRECT:\/canonical/);assert.deepEqual(r.calls.map(q=>q.table),['products']);r.release();
});
