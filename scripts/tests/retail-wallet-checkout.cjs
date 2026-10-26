const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');
const buyer = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const source = fs.readFileSync('lib/order-request-handler.ts', 'utf8');

function fixture(config = {}) {
  const state = { order: null, calls: [], debits: 0, balance: 90.31 };
  const user = config.anonymous ? null : { id: buyer, email: 'buyer@example.com', email_confirmed_at: config.unverified ? null : '2026-01-01', app_metadata: { wallet_disabled: config.disabled }, user_metadata: {} };
  const option = { id: 'option', product_id: 'product', denomination: 3000, denomination_currency: 'INR', is_active: true, is_in_stock: true };
  const db = {
    from(table) {
      let patch, columns, single = false;
      const filters = [];
      const query = {
        select(value) { columns = value; return this; },
        update(value) { patch = value; return this; },
        eq(key, value) { filters.push(row => row[key] === value); return this; },
        is(key, value) { filters.push(row => (row[key] ?? null) === value); return this; },
        in(key, values) { filters.push(row => values.includes(row[key])); return this; },
        gte() { return this; }, order() { return this; },
        or(value) {
          if (value.startsWith('customer_id.')) {
            const terms = value.split(',');
            filters.push(row => terms.some(term => term === 'customer_id.is.null' ? row.customer_id == null : term === `customer_id.eq.${row.customer_id}`));
          }
          return this;
        },
        single() { single = true; return this; }, maybeSingle() { single = true; return this; },
        then(resolve, reject) {
          return Promise.resolve().then(() => {
            if (table === 'orders') {
              if (patch?.customer_id && config.linkError) return { data: null, error: { message: 'Database unavailable' } };
              const rows = state.order && filters.every(filter => filter(state.order)) ? [state.order] : [];
              if (patch) rows.forEach(row => Object.assign(row, patch));
              return { data: single ? rows[0] ?? null : rows, error: single && !rows.length ? { code: 'PGRST116', message: 'No matching order' } : null };
            }
            if (table === 'product_options') return { data: [option], error: null };
            if (table === 'products') return { data: [{ id: 'product', name: 'Test card', retail_enabled: true, stock_quantity: 2147483647 }], error: null };
            if (table === 'product_purchase_restrictions') return { data: config.restricted ? [{ product_id: 'product', one_per_denomination: true, identity_mode: 'ACCOUNT_EMAIL', reset_mode: 'ROLLING_7_DAYS', limit_currency: 'INR', weekly_limit: 10000 }] : [], error: null };
            if (table === 'customer_product_discounts') return { data: [], error: null };
            if (table === 'order_items') return { data: [{ ...option, product_name: 'Test card', quantity: 1, total_price: 75.36, promotion_percent: 0 }], error: null };
            if (table === 'payment_gateway_settings') return { data: { gateway_commissions: {} }, error: null };
            if (table === 'payments') return { data: { method: 'WALLET' }, error: null };
            throw Error(`Unexpected query ${table}: ${columns}`);
          }).then(resolve, reject);
        },
      };
      return query;
    },
    async rpc(name, args) {
      state.calls.push({ name, args });
      if (name === 'create_customer_checked_order') {
        assert.equal(args.p_user, buyer, 'Identity comes from the authenticated session');
        const order = { id: 'order', order_number: 'IP-TEST', customer_id: Object.hasOwn(config, 'owner') ? config.owner : config.restricted ? buyer : null, customer_email: user.email, total: 75.36, subtotal: 75.36, currency: 'USD', status: 'PENDING_PAYMENT' };
        if (!config.missingOrder) state.order = order;
        return { data: { ...order }, error: null };
      }
      assert.equal(name, 'pay_order_with_wallet');
      assert.equal(state.order.customer_id, args.p_user_id, 'Only the linked owner can pay');
      if (config.insufficient) return { data: null, error: { message: 'Insufficient wallet balance.' } };
      state.debits++;
      state.balance = 14.95;
      state.order.status = 'PAID';
      return { data: { orderStatus: 'PAID', walletBalanceAfter: state.balance }, error: null };
    },
  };
  const mocks = Object.fromEntries([...source.matchAll(/from ["'](@\/[^"']+)["']/g)].map(match => [match[1], {}]));
  Object.assign(mocks, {
'@/lib/customer-purchase-access': { customerPurchaseContext: async () => ({ browserId: 'browser', ip: '192.0.2.1' }), assertCustomerPurchaseAccess: async () => {}, CustomerPurchaseAccessError: class extends Error {} },
    'server-only': {}, 'next/server': { NextResponse },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/supabase/server': { createClient: async () => ({ auth: { getUser: async () => ({ data: { user } }) } }) },
    '@/lib/request-security': { sameOrigin: () => true, requestLimit: async () => null },
    '@/lib/trusted-client-ip': { trustedClientIp: () => '203.0.113.1' },
    '@/lib/definiteplay-fulfillment': { supplierProductIds: async () => new Set() },
    '@/lib/product-range-data': { productRanges: async () => ({ ranges: [] }) },
    '@/lib/definiteplay-range-stock': { supplierRangeLimits: async () => new Map() },
    '@/lib/product-stock': { isUnlimitedStock: value => value === 2147483647 },
    '@/lib/purchase-restriction-exemptions': { exemptPurchaseProducts: async () => new Set() },
    '@/lib/purchase-restriction': { purchaseLimitSince: () => new Date('2026-10-01') },
    '@/lib/regional-purchase-limit': { regionalFaceValue: () => 3000, exceedsRegionalLimit: () => false },
    '@/lib/denomination-purchase-limit': { assertDenominationPurchaseLimit: () => {} },
    '@/lib/product-promotions': { extraCustomerPercent: () => 0 },
    '@/lib/payment-gateway-commissions': { calculateGatewayCommission: (_, __, total) => ({ fee: 0, value: 0, type: 'FIXED', total }) },
    '@/lib/manual-fulfillment': { prepareOrderForManualFulfillment: async () => ({ status: 'PAID' }) },
    '@/lib/email': { sendOrderCreatedEmails: async () => [], sendWalletDebitEmails: async () => [], sendOrderStatusEmails: async () => [] },
    '@/lib/telegram-order-notification': { notifyPaidOrderInTelegram: async () => {} },
    '@/lib/checkout-consent': { saveCheckoutConsent: async () => {} },
  });
  const exports = {};
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => Object.hasOwn(mocks, name) ? mocks[name] : require(name), process: { env: {} }, console: { error() {} }, Buffer, Date });
  return { state, submit: () => exports.POST(new NextRequest('https://shop.test/api/orders', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paymentMethod: 'wallet', customer: { email: config.email ?? 'buyer@example.com', id: other }, userId: other, items: [{ productOptionId: 'option', quantity: 1 }] }),
  })) };
}

test('restricted retail checkout accepts the customer linked during order creation', async () => {
  const f = fixture({ restricted: true });
  const response = await f.submit();
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
  assert.equal(f.state.calls[0].name, 'create_customer_checked_order');
  assert.equal(f.state.debits, 1);
  assert.equal(f.state.order.customer_id, buyer);
});

test('ordinary retail checkout still links an unassigned order before paying', async () => {
  const f = fixture();
  const response = await f.submit();
  assert.equal(response.status, 200, JSON.stringify(await response.json()));
  assert.equal(f.state.order.customer_id, buyer);
  assert.equal(f.state.debits, 1);
});

for (const [label, config] of [['another customer', { owner: other }], ['missing order', { missingOrder: true }], ['database error', { linkError: true }]]) {
  test(`wallet linking rejects ${label} without a debit`, async () => {
    const f = fixture(config);
    assert.equal((await f.submit()).status, 500);
    assert.equal(f.state.debits, 0);
    assert.equal(f.state.balance, 90.31);
    assert(!f.state.calls.some(call => call.name === 'pay_order_with_wallet'));
    if (config.owner) assert.equal(f.state.order.customer_id, config.owner, 'Never replace another owner');
  });
}

test('insufficient balance remains a payment failure without a debit', async () => {
  const f = fixture({ restricted: true, insufficient: true });
  const response = await f.submit();
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, 'Insufficient wallet balance.');
  assert.equal(f.state.debits, 0);
});

for (const [label, config, status] of [['signed out', { anonymous: true }, 401], ['disabled wallet', { disabled: true }, 403], ['different checkout email', { email: 'other@example.com' }, 400]]) {
  test(`${label} cannot create or pay an order`, async () => {
    const f = fixture(config);
    assert.equal((await f.submit()).status, status);
    assert.equal(f.state.calls.length, 0);
    assert.equal(f.state.debits, 0);
  });
}
