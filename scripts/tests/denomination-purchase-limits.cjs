const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), ts = require('typescript');
function load(file, imports = {}) {
  const result = { exports: {} };
  new Function('exports', 'require', 'module', ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText)(result.exports, name => name in imports ? imports[name] : require(name), result);
  return result.exports;
}
const limit = load('lib/denomination-purchase-limit.ts');
const item = (optionId, quantity = 1, customValue) => ({ optionId, quantity, customValue });

test('one per option across cart lines and history; distinct options remain available', () => {
  limit.assertDenominationPurchaseLimit([item('one'), item('two')], []);
  limit.assertDenominationPurchaseLimit([item('two')], [item('one')]);
  for (const [cart, history] of [[[item('one', 2)], []], [[item('one'), item('one')], []], [[item('one')], [item('one')]]])
    assert.throws(() => limit.assertDenominationPurchaseLimit(cart, history), /Only one of each/);
});
test('range face values normalize decimals without blocking distinct amounts', () => {
  limit.assertDenominationPurchaseLimit([item('range', 1, 100), item('range', 1, 200)], []);
  assert.throws(() => limit.assertDenominationPurchaseLimit([item('range', 1, '100.00')], [item('range', 1, 100)]), /Only one of each/);
  for (const q of [0, -1, 1.5, NaN]) assert.throws(() => limit.assertDenominationPurchaseLimit([item('one', q)], []));
});

test('cart check blocks duplicate restricted denominations before checkout', async () => {
  const cart = load('lib/cart-stock.ts', { '@/lib/denomination-purchase-limit': limit });
  const previousFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ limits: ['one', 'two'].map(id => ({ productOptionId: id, onePerDenomination: true, availableQuantity: null })) }) });
  const row = (id, quantity = 1) => ({ productId: 'product', productOptionId: id, quantity });
  try {
    await cart.validateCartStock([row('one'), row('two')]);
    await assert.rejects(cart.validateCartStock([row('one'), row('one')]), /Only one of each/);
    await assert.rejects(cart.validateCartStock([row('one', 2)]), /Only one of each/);
  } finally { global.fetch = previousFetch; }
});

function actionHarness({ installed = true, minimum = 1, authorized = true } = {}) {
  const writes = [];
  const admin = { from(table) {
    let value, filters = [];
    const chain = {
      select() { return this; }, eq(...args) { filters.push(args); return this; }, limit() { return this; }, maybeSingle() { return this; },
      update(v) { value = v; return this; }, upsert(v) { value = v; return this; },
      then(resolve) {
        if (value) writes.push({ table, value });
        resolve({ data: table === 'product_options' ? [{ id: 'option', minimum_quantity: minimum }] : { id: 'product' },
          error: table === 'product_purchase_restrictions' && !installed ? { code: '42703' } : null });
      },
    }; return chain;
  } };
  const actions = load('app/admin/products/[id]/edit/restrictions/actions.ts', {
    '@/lib/purchase-restriction': load('lib/purchase-restriction.ts'), '@/lib/purchase-restriction-currencies': { isRestrictionCurrency: () => true },
    '@/lib/paypalych-product-policy-server': { getProductPaypalychRestriction: async () => false },
    'next/cache': { revalidatePath() {} }, 'next/navigation': { redirect: url => { throw Error(url); } },
    '@/lib/supabase/admin': { createAdminClient: () => admin },
    '@/lib/supabase/admin-session': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin' } } }) },
      from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: authorized ? {} : null }) }) }) },
  });
  const form = new FormData();
  for (const [k, v] of Object.entries({ id: 'product', minimum_quantity: '1', weekly_limit: '3000', reset_mode: 'ROLLING_7_DAYS', identity_mode: 'ACCOUNT_EMAIL', limit_currency: 'INR', is_enabled: 'on', one_per_denomination: 'on', payment_method_WALLET: 'on' })) form.set(k, v);
  return { save: () => actions.saveProductRestriction(form), form, writes };
}
test('admin saves the per-denomination rule with the existing reset period and cap', async () => {
  const h = actionHarness(); await assert.rejects(h.save(), /success=/);
  const row = h.writes.find(w => w.table === 'product_purchase_restrictions').value;
  assert.equal(row.one_per_denomination, true); assert.equal(row.weekly_limit, 3000); assert.equal(row.reset_mode, 'ROLLING_7_DAYS');
});
test('missing setup, conflicting minimums and non-admin cannot change the rule', async () => {
  for (const options of [{ installed: false }, { minimum: 2 }, { authorized: false }]) {
    const h = actionHarness(options); await assert.rejects(h.save(), /error=|Access denied/); assert.equal(h.writes.length, 0);
  }
  const h = actionHarness(); h.form.delete('is_enabled'); await assert.rejects(h.save(), /Turn on Purchase restriction/); assert.equal(h.writes.length, 0);
});

test('checkout quotes check history across denominations and exemptions before an order RPC', async () => {
  const optionId = '00000000-0000-4000-8000-000000000100';
  const requested = { productOptionId: optionId, quantity: 1 };
  const user = { id: 'buyer', email: 'buyer@example.com', email_confirmed_at: '2026-01-01', app_metadata: {}, user_metadata: {} };
  let previous = [], exempt = false, rpcCalls = [], historyFilters = [], recoverFailure = false, expired = false;
  const db = {
    async rpc(name, args) { rpcCalls.push({ name, args }); return { data: args.p_action === 'recover' ? null : { total: 10 }, error: null }; },
    from(table) {
      const chain = { select() { return this; }, eq(...a) { if (table === 'orders') historyFilters.push(a); return this; }, in() { return this; },
        or(a) { historyFilters.push(a); return this; }, gte() { return this; }, maybeSingle() { return this; },
        then(resolve) {
          const data = {
            business_kyb: { status: 'APPROVED' },
            product_options: [{ id: optionId, product_id: 'product', denomination: 1000, denomination_currency: 'INR', is_active: true, is_in_stock: true }],
            products: [{ id: 'product', name: 'Card', minimum_quantity: 1, maximum_quantity: 10, retail_enabled: true, business_enabled: true, stock_quantity: 2147483647 }],
            product_purchase_restrictions: [{ product_id: 'product', one_per_denomination: true, weekly_limit: 3000, limit_currency: 'INR', reset_mode: 'ROLLING_7_DAYS', identity_mode: 'ACCOUNT_EMAIL' }],
            orders: previous.length ? [{ id: 'past' }] : [], order_items: previous,
          }[table];
          assert.notEqual(data, undefined, table); resolve({ data, error: null });
        },
      }; return chain;
    },
  };
  const currency = load('lib/purchase-restriction-currencies.ts');
  const imports = { 'server-only': {}, 'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } } };
  for (const m of fs.readFileSync('lib/order-request-handler.ts', 'utf8').matchAll(/from ["'](@\/[^"']+)["']/g)) imports[m[1]] ??= {};
  Object.assign(imports, {
    '@/lib/checkout-payment-session': { expireUnpaidCheckouts: async ids => { assert.deepEqual([...ids], ['past']); if (expired) previous = []; return expired ? 1 : 0; } },
    '@/lib/payment-failure-sync': { syncFailedGatewayPayments: async () => { if (recoverFailure) previous = []; return { checked: 0, failed: 0, releasedOrderIds: [] }; } },
    '@/lib/denomination-purchase-limit': limit,
    '@/lib/request-security': { sameOrigin: () => true, requestLimit: async () => null }, '@/lib/trusted-client-ip': { trustedClientIp: () => '192.0.2.1' },
    '@/lib/supabase/admin': { createAdminClient: () => db }, '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
    '@/lib/portal-checkout': load('lib/portal-checkout.ts'), '@/lib/business-security': { businessSessionReady: async () => true },
    '@/lib/product-range-data': { productRanges: async () => ({ ranges: [] }) }, '@/lib/definiteplay-range-stock': { supplierRangeLimits: async () => new Map() },
    '@/lib/definiteplay-fulfillment': { supplierProductIds: async () => new Set() }, '@/lib/product-stock': { isUnlimitedStock: () => true },
    '@/lib/purchase-restriction-exemptions': { exemptPurchaseProducts: async () => new Set(exempt ? ['product'] : []) },
    '@/lib/regional-purchase-limit': load('lib/regional-purchase-limit.ts', { './purchase-restriction-currencies': currency }),
    '@/lib/purchase-restriction': load('lib/purchase-restriction.ts'),
    '@/lib/cart-stock': load('lib/cart-stock.ts', { '@/lib/denomination-purchase-limit': limit }),
  });
  const { POST } = load('lib/order-request-handler.ts', imports);
  const quote = async (items = [requested]) => {
    rpcCalls = []; historyFilters = [];
    return POST({ nextUrl: { pathname: '/api/account/portal/orders' }, headers: new Headers(),
      json: async () => ({ action: 'quote', requestId: '00000000-0000-4000-8000-000000000009', paymentMethod: 'wallet', items }) });
  };
  let result = await quote(); assert.equal(result.status, 200, JSON.stringify(result.body));
  assert(rpcCalls.some(c => c.args.p_action === 'quote'));
  previous = [{ product_option_id: optionId, denomination: 1000, custom_value: null, quantity: 1, product_options: { denomination_currency: 'INR' } }];
  result = await quote(); assert.equal(result.status, 409); assert.match(result.body.error, /Only one of each/);
  assert(rpcCalls.every(c => c.args.p_action === 'recover')); assert(historyFilters.some(f => typeof f === 'string' && f.includes('paid_at.gte.')));
  exempt = true; result = await quote(); assert.equal(result.status, 409, 'Value exemption must not bypass denomination history');
  recoverFailure = true; result = await quote(); assert.equal(result.status, 200, 'Verified unpaid failure releases denomination on retry');
  assert(rpcCalls.some(c => c.args.p_action === 'quote'));
  recoverFailure = false; expired = true; previous = [{ product_option_id: optionId, denomination: 1000, custom_value: null, quantity: 1, product_options: { denomination_currency: 'INR' } }];
  result = await quote(); assert.equal(result.status, 200, 'Expired unpaid reservation releases denomination before another order is created');
  previous = []; result = await quote([requested, requested]); assert.equal(result.status, 409);
});
