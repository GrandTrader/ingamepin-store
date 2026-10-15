const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText;
  vm.runInNewContext(code, {exports, Map, Set, Date, console, require(name) {
    if (name in mocks) return mocks[name];
    if (name === 'server-only') return {};
    if (name === 'react/jsx-runtime') return require(name);
    throw Error('Unexpected dependency: ' + name);
  }});
  return exports;
}
const links = load('lib/product-statistics-imports.ts');
const {sourceId: source, targetId: target} = links.productStatisticsImports[0];
const extra = 'other-product';

function client(tables, calls = []) {
  return {from(table) {
    assert(table in tables, 'Unexpected table: ' + table);
    let predicates = [], from = 0, to = Infinity;
    const call = {table, filters: []}; calls.push(call);
    const q = {
      select(columns) {call.columns = columns; return q;},
      in(field, values) {
        call.filters.push(['in', field, [...values]]);
        if (field === 'orders.order_items.product_id') predicates.push(row => [row.orders].flat().some(order => order.order_items.some(item => values.includes(item.product_id))));
        else predicates.push(row => values.includes(field === 'orders.status' ? [row.orders].flat()[0]?.status : row[field]));
        return q;
      },
      eq(field, value) {call.filters.push(['eq', field, value]); predicates.push(row => row[field] === value); return q;},
      gte(field, value) {call.filters.push(['gte', field, value]); predicates.push(row => row[field] >= value); return q;},
      order() {return q;},
      range(a,b) {from=a;to=b;call.range=[a,b];return q;},
      limit(n) {to=n-1;return q;},
      then(resolve,reject) {return Promise.resolve({error:null,data:tables[table].filter(row => predicates.every(p => p(row))).slice(from,to+1)}).then(resolve,reject);},
    };
    // No write methods: any attempt to rewrite orders/reviews fails these tests.
    return q;
  }};
}
const dependencies = db => ({
  '@/lib/supabase/admin': {createAdminClient: () => db},
  'next/cache': {unstable_cache: fn => fn},
  './product-statistics-imports': links,
});

test('Imported sales are additive, repeatable and do not rewrite the source or unrelated products', () => {
  const sales = new Map([[source, 100], [target, 10], [extra, 7]]);
  const external = new Map([[source, 4], [target, 8]]);
  const first = links.mergeImportedProductSales(sales, external);
  assert.equal(first.get(target), 114);
  assert.equal(first.get(source), 100);
  assert.equal(first.get(extra), 7);
  assert.equal(sales.get(target), 10);
  assert.deepEqual([...first], [...links.mergeImportedProductSales(sales, external)]);
  assert.deepEqual([...links.statisticsProductIds(source)], [source]);
  assert.deepEqual([...links.statisticsProductIds(extra)], [extra]);
});

test('Storefront lists and the product editor agree, include every page and retain target sales', async () => {
  const rows = Array.from({length:1002}, (_,i) => ({product_id:source, quantity:2, orders:{status:'DELIVERED'}, id:String(i)}));
  rows.push({product_id:target, quantity:3, orders:{status:'PAID'}}, {product_id:extra,quantity:5,orders:{status:'PROCESSING'}}, {product_id:source,quantity:999,orders:{status:'CANCELLED'}});
  const db = client({order_items:rows, products:[{id:source,sold_count:4},{id:target,sold_count:8}]});
  const api = load('lib/product-sales.ts', dependencies(db));
  const all = await api.getPaidProductSales();
  assert.equal(all.get(target), 2011);
  assert.equal(await api.getPaidProductSalesForProduct(target), all.get(target));
  assert.equal(await api.getPaidProductSalesForProduct(source), 2004);
  assert.equal(await api.getPaidProductSalesForProduct(extra), 5);
  assert.equal(await api.getPaidProductSalesForProduct('missing'), 0);
  assert.equal((await api.getPaidProductSales()).get(target), 2011);
});

test('Visitor imports deduplicate shared visitors and preserve the 24-hour window across all pages', async () => {
  const now = new Date().toISOString(), old = new Date(Date.now()-48*60*60*1000).toISOString();
  const rows = Array.from({length:1001},(_,i)=>({product_id:source,visitor_hash:'v'+i,last_viewed_at:now}));
  rows.push({product_id:target,visitor_hash:'v0',last_viewed_at:now}, {product_id:target,visitor_hash:'target-only',last_viewed_at:now}, {product_id:source,visitor_hash:'old',last_viewed_at:old}, {product_id:extra,visitor_hash:'other',last_viewed_at:now});
  const api = load('lib/product-views.ts',dependencies(client({product_views:rows})));
  const all = await api.getProductVisitorCounts();
  assert.equal(all.get(target),1002);
  assert.equal(all.get(source),1001);
  assert.equal(all.get(extra),1);
  assert.equal((await api.getProductVisitorCounts(target)).get(target),1002);
  assert.equal((await api.getProductVisitorCounts(source)).get(source),1001);
  assert.equal((await api.getProductVisitorCounts(extra)).get(extra),1);
});

test('Reviews retain original purchase attribution, moderation and sentiment without duplicate supplier feedback', async () => {
  const review = (id,p,sentiment,is_visible=true) => ({id,customer_email:'buyer@example.test',sentiment,is_visible,comment:'Original text',created_at:'2026-10-10',orders:{order_items:[{product_id:p}]}});
  const supplier = (id,p) => ({id,digiseller_review_id:88,product_id:p,is_visible:true,sentiment:'POSITIVE',comment:'Supplier text',reviewed_at:'2026-10-09'});
  const tables = {order_reviews:[review('source-review',source,'NEGATIVE'),review('target-review',target,'POSITIVE'),review('hidden-review',source,'POSITIVE',false),review('other-review',extra,'POSITIVE')],digiseller_reviews:[supplier('old',source),supplier('current',target)]};
  const calls = [];
  const info = load('components/ProductInformation.tsx', {
    '@/lib/supabase/admin':{createAdminClient:()=>client(tables,calls)},
    '@/lib/product-statistics-imports':links,
    './ProductDetailsTabs':{__esModule:true,default:()=>null},
  }).default;
  const {props} = await info({productId:target,description:'Target description'});
  assert.equal(props.reviews.length,3);
  assert.equal(props.positiveCount,2);
  assert.equal(props.negativeCount,1);
  const imported = props.reviews.find(row=>row.id==='source-review');
  assert.equal(imported.originalProductName,'Apple India Bulk Order');
  assert.equal(imported.comment,'Original text');
  assert.equal(props.reviews.find(row=>row.id==='target-review').originalProductName,undefined);
  assert(props.reviews.some(row=>row.id==='digiseller-current'));
  assert(!JSON.stringify(props).includes('buyer@example.test'));
  assert(!props.reviews.some(row=>['hidden-review','other-review'].includes(row.id)));
  for(const query of calls) assert(query.filters.some(([op,field,value])=>op==='eq'&&field==='is_visible'&&value===true));
});
