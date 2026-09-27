const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, deps = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, Error, require: name => { if (name in deps) return deps[name]; throw Error('Unmocked ' + name); } });
  return exports;
}
const logic = load('lib/giftport-import.ts');
const item = { operatorCode: 'GP100', brandName: 'Example India', currency: 'INR', country: 'India', denominations: ['100.00', '500.00'], variable: true, variableRange: { min: '100.00', max: '1000.00' } };
const requestId = '11111111-1111-4111-8111-111111111111', categoryId = '22222222-2222-4222-8222-222222222222';
const input = () => ({ requestId, categoryId, operatorCode: 'GP100', title: 'Example India', titleRu: '', description: '', descriptionRu: '', options: [{ amount: '500', price: '6.99' }] });

test('import preserves INR face value and explicit USD price', () => {
  const draft = logic.prepareGiftPortDraft(input(), item);
  assert.equal(draft.options[0].denomination, 500);
  assert.equal(draft.options[0].price, 6.99);
  assert.equal(draft.region, 'India');
});
test('manual prices are required and cannot be inferred from face values', () => {
  for (const price of ['', 'NaN', '-1', '0', '1.001', '10000000']) {
    const data = input(); data.options[0].price = price;
    assert.throws(() => logic.prepareGiftPortDraft(data, item), /USD/);
  }
});
test('unknown currencies, fractional website values and unconfirmed ranges fail closed', () => {
  assert.throws(() => logic.prepareGiftPortDraft(input(), { ...item, currency: 'USD' }), /INR/);
  const data = input(); data.options[0].amount = '500.50';
  assert.throws(() => logic.prepareGiftPortDraft(data, item), /whole/);
  data.options[0].amount = '750';
  assert.throws(() => logic.prepareGiftPortDraft(data, { ...item, variable: null }), /not confirmed/);
  assert.equal(logic.prepareGiftPortDraft(data, item).options[0].denomination, 750);
  assert.throws(() => logic.prepareGiftPortDraft(input(), { ...item, denominationsIncomplete: true, variable: false }), /not confirmed/);
});
test('duplicate values and values outside the confirmed range are rejected', () => {
  const data = input(); data.options.push({ amount: '500.00', price: '6.99' });
  assert.throws(() => logic.prepareGiftPortDraft(data, item), /only once/);
  data.options = [{ amount: '1001', price: '12' }];
  assert.throws(() => logic.prepareGiftPortDraft(data, item), /not confirmed/);
});

function harness({ denied = false, stale = false, optionsFail = false, linksFail = false } = {}) {
  const calls = []; let product = null;
  const chain = (table, admin) => {
    const c = {
      select() { return c; }, eq() { return c; },
      async maybeSingle() { return table === 'products' ? { data: product, error: null } : { data: { id: categoryId, category_type: 'GIFT_CARD' }, error: null }; },
      async insert(value) { assert.equal(admin, true); calls.push(['insert', table, value]); if (table === 'products') product = value; return { error: table === 'product_options' && optionsFail ? { code: 'test' } : null }; },
    }; return c;
  };
  const api = load('app/admin/giftport/import/actions.ts', {
    'node:crypto': require('node:crypto'), 'next/cache': { revalidatePath() {} },
    '@/lib/giftport-admin': { requireGiftPortAdmin: async () => { calls.push(['auth']); if (denied) throw Error('denied'); return { from: t => chain(t, false) }; } },
    '@/lib/definiteplay-admin': { validProductId: v => /^[a-f0-9-]{36}$/.test(v) },
    '@/lib/supabase/admin': { createAdminClient: () => ({ from: t => chain(t, true) }) },
    '@/lib/giftport-relay': { getGiftPortStatus: async () => ({ configured: true, stale, snapshot: { items: [item] } }), giftPortRequest: async (...args) => { calls.push(['links', ...args]); if (linksFail) throw Error('unavailable'); return { success: true }; } },
    '@/lib/giftport-import': logic, '@/lib/product-stock': { UNLIMITED_STOCK_QUANTITY: 2147483647 },
  });
  return { api, calls };
}
test('admin access is checked before all reads and writes', async () => {
  const { api, calls } = harness({ denied: true });
  await assert.rejects(() => api.importGiftPortProduct(input()), /denied/);
  assert.equal(calls.length, 1);
});
test('stale catalogue cannot create products', async () => {
  const { api, calls } = harness({ stale: true });
  assert.ok((await api.importGiftPortProduct(input())).error);
  assert.equal(calls.filter(c => c[0] === 'insert').length, 0);
});
test('import saves an unsellable draft and supplier links in one batch', async () => {
  const { api, calls } = harness();
  assert.equal((await api.importGiftPortProduct(input())).productId, requestId);
  const p = calls.find(c => c[0] === 'insert' && c[1] === 'products')[2];
  assert.equal(p.status, 'DRAFT'); assert.equal(p.stock_quantity, 0); assert.equal(p.stock_source, 'OWNED'); assert.equal(p.delivery_type, 'MANUAL'); assert.equal(p.currency, 'USD');
  const o = calls.find(c => c[0] === 'insert' && c[1] === 'product_options')[2][0];
  assert.equal(o.denomination_currency, 'INR'); assert.equal(o.is_in_stock, false); assert.equal(o.selling_price, 6.99);
  const link = calls.find(c => c[0] === 'links');
  assert.equal(link[1], 'links'); assert.equal(link[2].mappings[0].amount, '500.00');
});
test('retrying an import ID does not duplicate a product or options', async () => {
  const { api, calls } = harness();
  await api.importGiftPortProduct(input());
  const before = calls.filter(c => c[0] === 'insert').length;
  const result = await api.importGiftPortProduct(input());
  assert.equal(result.productId, requestId); assert.ok(result.warning);
  assert.equal(calls.filter(c => c[0] === 'insert').length, before);
});
test('failed options never create links, and partial failures keep draft for review', async () => {
  for (const config of [{ optionsFail: true }, { linksFail: true }]) {
    const { api, calls } = harness(config);
    const result = await api.importGiftPortProduct(input());
    assert.equal(result.productId, requestId); assert.ok(result.warning);
    if (config.optionsFail) assert.equal(calls.filter(c => c[0] === 'links').length, 0);
    assert.equal(calls.find(c => c[0] === 'insert' && c[1] === 'products')[2].status, 'DRAFT');
  }
});

function linkHarness({ denied = false, source = 'OWNED', wrongParent = false, currency = 'INR', amount = 500, stale = false } = {}) {
  const calls = [];
  const optionId = '33333333-3333-4333-8333-333333333333';
  const chain = table => {
    const filters = [];
    const c = { select() { return c; }, eq(k, v) { filters.push([k, v]); return c; },
      async maybeSingle() {
        if (table === 'products') return { data: { id: requestId, stock_source: source }, error: null };
        assert.ok(filters.some(([k, v]) => k === 'product_id' && v === requestId));
        assert.ok(filters.some(([k, v]) => k === 'id' && v === optionId));
        return { data: wrongParent ? null : { id: optionId, product_id: requestId, denomination: amount, denomination_currency: currency }, error: null };
      } }; return c;
  };
  const api = load('app/admin/giftport/link-actions.ts', {
    'next/cache': { revalidatePath() {} },
    '@/lib/giftport-admin': { requireGiftPortAdmin: async () => { calls.push(['auth']); if (denied) throw Error('denied'); return { from: chain }; } },
    '@/lib/definiteplay-admin': { validProductId: v => /^[a-f0-9-]{36}$/.test(v) },
    '@/lib/giftport-relay': { getGiftPortStatus: async () => ({ configured: true, stale, snapshot: { items: [item] } }), giftPortRequest: async (...args) => { calls.push(['write', ...args]); return { success: true }; } },
    '@/lib/giftport-import': logic,
  });
  return { api, calls, optionId };
}
test('product-link actions require admin access before any supplier writes', async () => {
  const { api, calls, optionId } = linkHarness({ denied: true });
  await assert.rejects(() => api.saveGiftPortLink(requestId, optionId, item.operatorCode), /denied/);
  assert.equal(calls.length, 1);
});
test('links reject other-product options, active suppliers, stale data and incompatible amounts', async () => {
  for (const config of [{ wrongParent: true }, { source: 'DEFINITEPLAY' }, { stale: true }, { currency: 'USD' }, { amount: 1001 }]) {
    const { api, calls, optionId } = linkHarness(config);
    assert.ok((await api.saveGiftPortLink(requestId, optionId, item.operatorCode)).error);
    assert.equal(calls.filter(c => c[0] === 'write').length, 0);
  }
});
test('valid links use the database option amount, not client-provided pricing', async () => {
  const { api, calls, optionId } = linkHarness();
  assert.equal((await api.saveGiftPortLink(requestId, optionId, item.operatorCode)).success, true);
  const write = calls.find(c => c[0] === 'write')[2];
  assert.equal(write.productId, requestId); assert.equal(write.mappings[0].optionId, optionId);
  assert.equal(write.mappings[0].amount, '500.00'); assert.equal(write.mappings[0].currency, 'INR');
});
test('removing a link stays scoped to the verified website option', async () => {
  const { api, calls, optionId } = linkHarness({ stale: true });
  assert.equal((await api.saveGiftPortLink(requestId, optionId, null)).success, true);
  const write = calls.find(c => c[0] === 'write')[2];
  assert.equal(write.operation, 'remove'); assert.equal(write.productId, requestId); assert.equal(write.optionId, optionId);
});
