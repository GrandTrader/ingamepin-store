const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
function load(file) {
  const module = { exports: {} };
  new Function('module', 'exports', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText)(module, module.exports);
  return module.exports;
}
const { manualCodeRangeDefaults } = load('lib/manual-code-range.ts');
const { rangePrice } = load('lib/product-range.ts');
const product = { product_type: 'GIFT_CARD', stock_source: 'OWNED', delivery_type: 'AUTOMATIC' };
const option = (denomination, selling_price, extra = {}) => ({ denomination, selling_price, denomination_currency: 'INR', is_active: true, is_custom_value: false, ...extra });
const options = [option(1000, 10.79), option(5000, 53.79), option(100, 1.08, { is_in_stock: false }), option(150, 1.62)];
const defaults = manualCodeRangeDefaults(product, options);
assert.deepEqual(defaults, { currency: 'INR', minimum: 100, maximum: 5000, step: 1, price_basis: 100, price_usd: 1.08 });
assert.equal(rangePrice({ ...defaults, enabled: true }, 650), 7.02);
assert.equal(rangePrice({ ...defaults, enabled: true }, 5000), 54);
for (const amount of [99, 5001, 650.5, NaN]) assert.throws(() => rangePrice({ ...defaults, enabled: true }, amount));
assert.deepEqual(manualCodeRangeDefaults(product, [...options, option(1, .01, { is_active: false }), option(null, 0, { is_custom_value: true })]), defaults);
for (const changes of [{ product_type: 'GAME_TOPUP' }, { product_type: 'SUBSCRIPTION' }, { stock_source: 'FKWALLET' }, { stock_source: 'DEFINITEPLAY' }, { delivery_type: 'MANUAL' }]) assert.equal(manualCodeRangeDefaults({ ...product, ...changes }, options), null);
for (const invalid of [[option(100, 1)], [...options, option(200, 2, { denomination_currency: 'USD' })], [...options, option(100, 2)], [option(0, 1), option(100, 1)], [option(100, 0), option(1000, 1)], [option(1.5, 1), option(100, 1)]]) assert.equal(manualCodeRangeDefaults(product, invalid), null);
assert.equal(manualCodeRangeDefaults(product, [option(10, .26, { denomination_currency: 'TRY' }), option(2000, 44.21, { denomination_currency: 'TRY' })]).price_usd, .26);
console.log('PASS manual ranges: smallest active denomination pricing, bounds, sold-out codes, excluded product types, mixed currencies and ambiguous rates.');
