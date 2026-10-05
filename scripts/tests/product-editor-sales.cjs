const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const queries = [], caches = [];
let failure = false;
const moduleExports = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/product-sales.ts', 'utf8'), {
  compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022},
}).outputText, {exports: moduleExports, require(name) {
  if (name === 'next/cache') return {unstable_cache(fn, key, options) {caches.push({key, options}); return fn;}};
  if (name === '@/lib/supabase/admin') return {createAdminClient() {return {from(table) {
    const query = {table}; queries.push(query);
    return {
      select(columns) {query.columns = columns; return this;},
      eq(field, value) {query.filter = [field, value]; return this;},
      in(field, values) {query.statuses = [field, [...values]]; return this;},
      order(field) {query.order = field; return this;},
      async range(from, to) {
        query.range = [from, to];
        if (failure) return {error: {message: 'Unavailable'}};
        const row = status => ({product_id: query.filter[1], quantity: 2, orders: {status}});
        if (query.filter[1] === 'second-product') return {data: []};
        return {data: from === 0 ? Array.from({length: 1000}, () => row('PAID')) : [
          row('PROCESSING'), {product_id: query.filter[1], quantity: 3, orders: [{status:'DELIVERED'}]},
          row('CANCELLED'), {product_id: query.filter[1], quantity: 5, orders: null},
        ]};
      },
    };
  }};}};
  throw Error('Unexpected import: ' + name);
}});
(async () => {
  assert.equal(await moduleExports.getPaidProductSalesForProduct('first-product'), 2005);
  assert.equal(queries.length, 2, 'Page through all sales, including products with over 1,000 order lines');
  for (const query of queries) {
    assert.deepEqual(query.filter, ['product_id', 'first-product']);
    assert.equal(query.order, 'id');
    assert.deepEqual(query.statuses, ['orders.status', ['PAID','PROCESSING','DELIVERED']]);
  }
  assert.deepEqual(queries.map(q => q.range), [[0,999],[1000,1999]]);
  assert.equal(await moduleExports.getPaidProductSalesForProduct('second-product'), 0);
  assert.deepEqual(queries.at(-1).filter, ['product_id','second-product']);
  failure = true;
  await assert.rejects(() => moduleExports.getPaidProductSalesForProduct('first-product'), /Unable to calculate product sales: Unavailable/);
  assert.equal(caches.at(-1).options.revalidate, 30);
  assert(caches.at(-1).options.tags.includes('paid-product-sales'));
  console.log('PASS: product-scoped sales, pagination, paid statuses, empty sales, error handling and shared invalidation tag.');
})().catch(error => {console.error(error); process.exitCode = 1;});
