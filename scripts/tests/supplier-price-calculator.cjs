const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, deps = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, Error, require: name => { if (name in deps) return deps[name]; throw Error('Unmocked ' + name); } });
  return exports;
}
const logic = load('lib/supplier-price-calculator.ts');
const calc = logic.calculateSupplierPrices;
test('INR face value uses inverse website rate and adds markup once', () => {
  const result = calc(['1020.00', '510.00'], 'INR', '10', { store_usd_inr_rate: '102' });
  assert.equal(result.prices['1020.00'], '11.00');
  assert.equal(result.prices['510.00'], '5.50');
  assert.equal(result.rate, 102);
});
test('USD identity conversion, RUB conversion, zero and fractional markup', () => {
  assert.equal(calc(['10'], 'USD', '0', {}).prices['10'], '10.00');
  assert.equal(calc(['850'], 'RUB', '12.5', { store_usd_rub_rate: 85 }).prices['850'], '11.25');
  assert.equal(calc(['100'], 'USD', '0.5', {}).prices['100'], '100.50');
});
test('currency conversion rounds only the final price including half cents', () => {
  assert.equal(calc(['89'], 'INR', '10', { store_usd_inr_rate: 102 }).prices['89'], '0.96');
  assert.equal(calc(['1'], 'USD', '0.5', {}).prices['1'], '1.01');
});
test('missing, invalid and unsupported rates never fall back to USD or a guessed rate', () => {
  for (const value of [undefined, null, '', 0, -1, NaN, Infinity, true]) {
    assert.throws(() => calc(['500'], 'INR', '10', { store_usd_inr_rate: value }), /exchange rate/);
  }
  assert.throws(() => calc(['500'], 'TRY', '10', { store_usd_inr_rate: 102 }), /exchange rate/);
});
test('rejects invalid percentages, values and prices outside storage limits', () => {
  for (const value of ['', '-10', 'NaN', 'Infinity', '1e2', '1001', '1.001']) assert.throws(() => calc(['10'], 'USD', value, {}), /markup/);
  for (const value of ['', '0', '-1', '__proto__', '1.001', null]) assert.throws(() => calc([value], 'USD', '0', {}), /face value/);
  assert.throws(() => calc([], 'USD', '0', {}), /Select/);
  assert.throws(() => calc(Array(51).fill('1'), 'USD', '0', {}), /Select/);
  assert.throws(() => calc(['999999999'], 'USD', '1000', {}), /outside/);
  assert.throws(() => calc(['0.01'], 'INR', '0', { store_usd_inr_rate: 102 }), /outside/);
});
function harness({ denied = false, failure = false } = {}) {
  let rate = 100, reads = 0;
  const chain = { select() { return chain; }, eq() { return chain; }, async maybeSingle() { reads++; return { data: { store_usd_inr_rate: rate }, error: failure ? { message: 'private database detail' } : null }; } };
  const api = load('app/admin/giftport/import/pricing-actions.ts', {
    '@/lib/giftport-admin': { requireGiftPortAdmin: async () => { if (denied) throw Error('denied'); } },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: () => chain }) },
    '@/lib/supplier-price-calculator': logic,
  });
  return { api, setRate: value => { rate = value; }, reads: () => reads };
}
test('calculator requires administrator access before reading rates', async () => {
  const h = harness({ denied: true });
  await assert.rejects(() => h.api.calculateGiftPortPrices(['1000'], 'INR', '10'), /denied/);
  assert.equal(h.reads(), 0);
});
test('each apply uses the current saved website rate', async () => {
  const h = harness();
  assert.equal((await h.api.calculateGiftPortPrices(['1000'], 'INR', '10')).result.prices['1000'], '11.00');
  h.setRate(110);
  assert.equal((await h.api.calculateGiftPortPrices(['1000'], 'INR', '10')).result.prices['1000'], '10.00');
  assert.equal(h.reads(), 2);
});
test('rate errors return no replacement prices or private database details', async () => {
  const response = await harness({ failure: true }).api.calculateGiftPortPrices(['500'], 'INR', '10');
  assert.equal(response.result, undefined);
  assert.match(response.error, /Unable to load/);
  assert.ok(!response.error.includes('private'));
});
