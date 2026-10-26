const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');

function load(file, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, require: name => name === 'server-only' ? {} : name in mocks ? mocks[name] : require(name),
    Date, Intl, process, console,
  }, { filename: file });
  return exports;
}
const details = load('lib/order-receipt-details.ts');
const { ownsPurchase } = load('lib/purchase-access.ts', {
  'next/headers': {}, '@/lib/supabase/server': {}, '@/lib/supabase/admin': {},
});
const order = {
  id: 'order-fixture', order_number: 'IP20261026123456', customer_id: 'owner-id',
  customer_name: 'Fixture Customer', customer_email: 'owner@example.invalid', customer_phone: '+10000000000',
  customer_ip: '2001:db8:1234::8', customer_note: 'Receipt fixture', sales_channel: 'RETAIL',
  status: 'DELIVERED', subtotal: 20, discount: 2, payment_fee: 1, total: 19, currency: 'USD',
  created_at: '2026-10-25T20:00:00Z', paid_at: '2026-10-25T20:05:00Z', delivered_at: '2026-10-25T20:06:00Z',
  admin_note: 'PRIVATE-ADMIN-NOTE', access_token_hash: 'PRIVATE-TOKEN',
};
const payment = { method: 'PALLY', status: 'VERIFIED', amount: 1700, currency: 'RUB', transaction_id: 'fixture-txn', gateway_order_id: 'fixture-bill', gateway_payment_id: 'fixture-payment', submitted_at: order.paid_at, verified_at: order.paid_at, webhook_secret: 'PRIVATE-SECRET' };
const item = { id: 'item-fixture', product_id: 'product-fixture', product_name: 'Gift card', option_name: 'Range - 1000 INR', denomination: null, custom_value: 1000, product_options: null, quantity: 2, unit_price: 10, total_price: 20, service_delivered_at: null, fulfillment_mode: 'RANGE_MANUAL' };
function fixture(identity, overrides = {}) {
  const tables = [];
  const db = { from(table) {
    tables.push(table);
    assert(['orders', 'payments', 'order_items', 'products'].includes(table));
    const q = {};
    for (const name of ['select', 'eq', 'order', 'limit', 'in']) q[name] = () => q;
    const result = () => ({ data: table === 'orders' ? { ...order, ...overrides.order } : table === 'payments' ? payment : table === 'order_items' ? [item] : [{ id: 'product-fixture', region: 'India' }], error: overrides.error ?? null });
    q.maybeSingle = () => Promise.resolve(result());
    q.then = (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
    return q;
  } };
  return { tables, ...load('app/api/orders/lookup/route.ts', {
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/purchase-access': { purchaseIdentity: async () => identity, ownsPurchase },
    '@/lib/request-security': { requestLimit: async () => null, privateJson: (data, status) => NextResponse.json(data, { status }) },
    '@/lib/purchase-list': {},
    '@/lib/delivered-codes': { getAllDeliveredCodes: async () => [] },
    '@/lib/delivery-receipts': { getAuthorizedDeliveryReceipts: async () => new Map() },
  }) };
}
const request = () => new NextRequest('https://shop.invalid/api/orders/lookup', { method: 'POST', body: JSON.stringify({ orderNumber: order.order_number, email: order.customer_email }), headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '198.51.100.99' } });

test('receipt uses saved checkout IP and explicit India time, including the next calendar day', () => {
  for (const value of [null, undefined, '', '  ']) assert.equal(details.receiptCheckoutIp(value), 'Not recorded');
  for (const ip of ['203.0.113.8', '2001:db8:1234::8']) assert.equal(details.receiptCheckoutIp(ip), ip);
  assert.match(details.formatReceiptDate('2026-10-25T20:00:00Z'), /26 Oct 2026.*1:30.*am IST/i);
  for (const value of [null, undefined, 'invalid']) assert.equal(details.formatReceiptDate(value), 'Not recorded');
});

test('receipt lookup rejects anonymous and other customers before reading any payment details', async () => {
  for (const identity of [null, { email: 'other@example.invalid', userId: 'other-id', source: 'account' }, { email: 'other@example.invalid', userId: null, source: 'guest' }]) {
    const f = fixture(identity), response = await f.POST(request());
    assert.equal(response.status, identity ? 404 : 401);
    assert.deepEqual(f.tables, identity ? ['orders'] : []);
    const body = JSON.stringify(await response.json());
    for (const sensitive of [order.customer_email, order.customer_ip, payment.transaction_id]) assert(!body.includes(sensitive));
  }
});

test('verified owner sees saved order/payment details without internal secrets or viewer IP', async () => {
  for (const identity of [{ email: order.customer_email, userId: null, source: 'guest' }, { email: 'updated@example.invalid', userId: 'owner-id', source: 'account' }]) {
    const f = fixture(identity), response = await f.POST(request());
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
    const body = await response.json();
    assert.equal(body.order.checkoutIp, order.customer_ip);
    assert.equal(body.order.customerPhone, order.customer_phone);
    assert.equal(body.order.paymentFee, 1);
    assert.equal(body.order.total, 19);
    assert.equal(body.order.paymentCurrency, 'RUB');
    assert.equal(body.order.paymentAmount, 1700);
    assert.equal(body.order.gatewayOrderId, payment.gateway_order_id);
    assert.equal(body.order.gatewayPaymentId, payment.gateway_payment_id);
    assert.equal(body.order.transactionId, payment.transaction_id);
    assert.equal(body.order.verifiedAt, payment.verified_at);
    assert.equal(body.items[0].unitPrice, 10);
    assert.equal(body.items[0].customValue, 1000);
    assert.equal(body.items[0].totalPrice, 20);
    assert(!JSON.stringify(body).includes('PRIVATE-'));
    assert(!JSON.stringify(body).includes('198.51.100.99'));
  }
});

test('historical orders without recorded IP stay empty and database failures do not expose details', async () => {
  const identity = { email: order.customer_email, userId: null, source: 'guest' };
  const missing = await fixture(identity, { order: { customer_ip: null } }).POST(request());
  assert.equal((await missing.json()).order.checkoutIp, null);
  const failed = await fixture(identity, { error: { message: 'Database unavailable' } }).POST(request());
  assert.equal(failed.status, 500);
  assert.equal((await failed.json()).order, undefined);
});
