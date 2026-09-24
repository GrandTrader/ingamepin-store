const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const test = require('node:test');
const mod = { exports: {} };
new Function('exports', 'require', 'module', ts.transpileModule(
  fs.readFileSync('lib/product-option-input.ts', 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }
).outputText)(mod.exports, require, mod);
const { parseProductOptions } = mod.exports;
const row = { id: 'existing-option', name: '100', denomination: 100, currency: 'INR', sellingPrice: 1.08, isActive: true, isInStock: true };
const parse = (changes = {}) => parseProductOptions(JSON.stringify([{ ...row, ...changes }]))[0];

test('unchanged numeric options and edited numeric strings produce identical saved values', () => {
  assert.deepEqual(parse({ denomination: '100', sellingPrice: '1.08' }), row);
  assert.deepEqual(parse(), row);
});
test('all sixteen manually edited denominations save with numeric prices', () => {
  const values = [100,150,200,250,300,400,500,750,1000,1500,2000,2500,3000,5000,7500,10000];
  const result = parseProductOptions(JSON.stringify(values.map(n => ({ ...row, name: String(n), denomination: String(n), sellingPrice: (n * .0108).toFixed(2) }))));
  result.forEach((r,i) => { assert.equal(r.denomination, values[i]); assert.equal(r.sellingPrice, Math.round(values[i]*1.08)/100); });
});
test('mixed untouched and edited rows work together', () => {
  const r = parseProductOptions(JSON.stringify([row, { ...row, name: '150', denomination: '150', sellingPrice: '1.62' }]));
  assert.equal(r[1].sellingPrice, 1.62);
});
test('blank, null, boolean, array and non-finite prices cannot become free stock', () => {
  for (const value of ['', ' ', null, false, [], {}, 'Infinity', 'NaN', 'no', '-1']) {
    assert.throws(() => parse({ sellingPrice: value }), /selling price/);
  }
});
test('explicit zero price retains existing admin behavior', () => {
  assert.equal(parse({ sellingPrice: '0' }).sellingPrice, 0);
});
test('invalid denomination is rejected instead of silently truncated', () => {
  for (const value of ['', null, false, [], '1.5', '0', '-1']) assert.throws(() => parse({ denomination: value }), /denomination/);
});
test('bad payloads and malformed rows give validation errors', () => {
  for (const value of ['bad', 'null', '{}', '[]', '[null]', '[12]']) assert.throws(() => parseProductOptions(value));
  assert.throws(() => parseProductOptions(JSON.stringify(Array(51).fill(row))));
});
test('error identifies the invalid row and option; flags and identities are preserved', () => {
  assert.throws(() => parseProductOptions(JSON.stringify([row, {...row,name:'150',sellingPrice:''}])), /Option 2 \(150\).*selling price/);
  assert.equal(parse({ isInStock:false }).isInStock, false);
  assert.equal(parse({ isActive:false }).isActive, false);
  assert.throws(() => parse({currency:'bad'}), /currency/);
});
function loadSaveAction() {
  const writes = [];
  const redirects = [];
  const actionModule = { exports: {} };
  const session = {
    auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { user_id: 'admin' } }) }) }) }),
  };
  const admin = { from(table) {
    let operation = 'select';
    const chain = {
      select() { return chain; }, eq() { return chain; }, in() { return chain; },
      update(values) { operation = 'update'; writes.push({ table, values }); return chain; },
      insert(values) { operation = 'insert'; writes.push({ table, values }); return chain; },
      async maybeSingle() { return { data: { category_id: 'category', stock_quantity: 10 } }; },
      then(resolve, reject) { return Promise.resolve({ data: operation === 'select' ? [{ id: row.id, selling_price: 1.08, is_active: true }] : null, error: null }).then(resolve, reject); },
    };
    return chain;
  } };
  const dependencies = {
    'next/cache': { revalidatePath() {} },
    'next/navigation': { redirect(url) { redirects.push(url); throw new Error('REDIRECT ' + decodeURIComponent(url)); } },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/supabase/admin-session': { createClient: async () => session },
    '@/lib/product-stock': { isUnlimitedStock: () => false, UNLIMITED_STOCK_QUANTITY: 2147483647 },
    '@/lib/product-option-input': { parseProductOptions },
  };
  const source = fs.readFileSync('app/admin/products/[id]/edit/product-options/actions.ts', 'utf8');
  new Function('exports','require','module', ts.transpileModule(source, { compilerOptions: { module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020 } }).outputText)(actionModule.exports, name => {
    assert.ok(dependencies[name], 'Unexpected dependency: '+name); return dependencies[name];
  }, actionModule);
  return { save: actionModule.exports.saveProductOptions, writes, redirects };
}
test('save action accepts edited text and sends numeric prices to database', async () => {
  const app = loadSaveAction();
  const form = new FormData();
  form.set('id','test-product');
  form.set('options',JSON.stringify([{ ...row, denomination:'100',sellingPrice:'1.08' }]));
  await assert.rejects(() => app.save(form), /success=Product options saved/);
  assert.equal(app.writes.length,1);
  assert.equal(app.writes[0].table,'product_options');
  assert.equal(app.writes[0].values.selling_price,1.08);
  assert.equal(app.writes[0].values.denomination,100);
});
test('save action rejects an empty edited price before any database write', async () => {
  const app = loadSaveAction();
  const form = new FormData(); form.set('id','test-product');
  form.set('options',JSON.stringify([{ ...row,sellingPrice:'' }]));
  await assert.rejects(() => app.save(form), /error=Option 1.*selling price/);
  assert.equal(app.writes.length,0);
});