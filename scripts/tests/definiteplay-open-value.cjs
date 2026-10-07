const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, dependencies = {}, env = 'development') {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, {
    exports, process: { env: { NODE_ENV: env }, cwd: () => '/preview' },
    require: name => {
      if (Object.hasOwn(dependencies, name)) return dependencies[name];
      if (name === 'react/jsx-runtime') return require(name);
      throw Error('Unmocked dependency: ' + name);
    },
  });
  return exports;
}
const logic = load('lib/definiteplay-open-value.ts');
const row = { sku: 'TEST-UK', product: 'Sample UK', brand: 'Sample', region: 'UK', lowerLimit: '10', upperLimit: '125', minimumIncrement: '0.01', cardCurrency: 'GBP', discount: '5.00%' };
const snapshot = products => ({ checkedAt: '2026-10-07T14:00:00Z', catalogueStatus: 200, products });

test('preserves decimal ranges and negative supplier discounts, strips unrelated fields', () => {
  const data = logic.parseOpenValueSnapshot({ ...snapshot([row, { ...row, sku: 'TEST-USD', lowerLimit: '1.1', upperLimit: '500', minimumIncrement: '1', discount: '-2.50%', cardCurrency: 'USD' }]), credentials: 'DO NOT EXPOSE' });
  assert.equal(data.items[0].increment, '0.01');
  assert.equal(data.items[1].minimum, '1.1');
  assert.equal(data.items[1].discountPercent, -2.5);
  assert.equal(logic.formatOpenValueDiscount(-2.5), '2.5% surcharge');
  assert.equal(logic.formatOpenValueDiscount(5), '5% discount');
  assert.equal(logic.formatOpenValueDiscount(0), 'Face value');
  assert.equal(JSON.stringify(data).includes('credentials'), false);
});

test('rejects ambiguous and invalid supplier data instead of displaying guessed values', () => {
  for (const change of [
    { lowerLimit: '0' }, { upperLimit: '9' }, { minimumIncrement: '0' }, { cardCurrency: '' },
    { lowerLimit: '1e2' }, { discount: 'unknown' }, { discount: '101%' }, { sku: '../bad' },
  ]) assert.throws(() => logic.parseOpenValueSnapshot(snapshot([{ ...row, ...change }])));
  assert.throws(() => logic.parseOpenValueSnapshot(snapshot([row, row])), /duplicate/);
  assert.throws(() => logic.parseOpenValueSnapshot({ ...snapshot([row]), checkedAt: 'invalid' }));
  assert.throws(() => logic.parseOpenValueSnapshot({ ...snapshot([row]), catalogueStatus: 401 }));
  assert.equal(logic.parseOpenValueSnapshot({ ...snapshot([]), catalogueStatus: 201 }).items.length, 0);
});

test('search, region and currency filters combine and clear without changing catalogue rows', () => {
  const items = logic.parseOpenValueSnapshot(snapshot([row, { ...row, sku: 'TEST-FR', product: 'Sample France', region: 'FR', cardCurrency: 'EUR' }])).items;
  assert.equal(logic.filterOpenValueItems(items, ' sample ', 'UK', 'GBP').length, 1);
  assert.equal(logic.filterOpenValueItems(items, 'test-fr', '', '')[0].sku, 'TEST-FR');
  assert.equal(logic.filterOpenValueItems(items, '', 'FR', 'GBP').length, 0);
  assert.equal(logic.filterOpenValueItems(items, '', '', '').length, 2);
  assert.equal(items.length, 2);
});

test('private export cannot be read in production and file failures expose no internals', async () => {
  let reads = 0;
  const dependencies = {
    'server-only': {}, 'node:path': { join: (...parts) => parts.join('/') },
    'node:fs/promises': { readFile: async () => { reads++; throw Error('secret server path'); } },
    './definiteplay-open-value': logic,
  };
  await assert.rejects(load('lib/definiteplay-open-value-preview.ts', dependencies, 'production').getOpenValuePreview(), /Local preview is unavailable/);
  assert.equal(reads, 0);
  await assert.rejects(load('lib/definiteplay-open-value-preview.ts', dependencies).getOpenValuePreview(), error => !error.message.includes('secret') && /missing or invalid/.test(error.message));
});

test('supplier import action checks admin access before loading the private catalogue', async () => {
  let reads = 0, authenticated = false;
  const data = logic.parseOpenValueSnapshot(snapshot([row]));
  const dependencies = {
    '@/lib/definiteplay-admin': { requireDefinitePlayAdmin: async () => { if (!authenticated) throw Error('login required'); } },
    '@/lib/definiteplay-open-value-connection': { getOpenValueConnection: async () => { reads++; return data; } },
  };
  const action = load('app/admin/definiteplay/open-value-actions.ts', dependencies, 'production').loadOpenValueProducts;
  await assert.rejects(action(), /login required/);
  assert.equal(reads, 0);
  authenticated = true;
  assert.equal((await action()).data, data);
  assert.equal(reads, 1);
});
