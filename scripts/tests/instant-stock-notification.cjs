const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const fixed = { id: 'fixed', product_id: 'product', option_name: '100 INR', denomination: 100, stock_quantity: 0, is_custom_value: false, option_type: 'GIFT_CARD' };
const range = { ...fixed, id: 'range', option_name: 'Range denomination', is_custom_value: true, option_type: 'RANGE' };
const product = { id: 'product', name: 'Apple India', delivery_type: 'AUTOMATIC' };
const item = (option, mode = null) => ({ order_id: 'order', product_id: option.product_id, product_option_id: option.id, fulfillment_mode: mode });

function fixture({ items = [item(fixed)], options = [fixed], products = [product], failTable = null } = {}) {
  const sent = { push: [], email: [], telegram: [] }, claims = new Set(), reads = [], errors = [];
  const rows = { order_items: items, product_options: options, products };
  const db = { from(table) {
    reads.push(table);
    let filters = [], fields;
    const query = {
      select(value) { fields = value.split(',').map(s => s.trim()); return query; },
      eq(key, value) { filters.push(row => row[key] === value); return query; },
      neq(key, value) { filters.push(row => row[key] !== null && row[key] !== undefined && row[key] !== value); return query; },
      in(key, values) { filters.push(row => values.includes(row[key])); return query; },
      lte(key, value) { filters.push(row => row[key] <= value); return query; },
      async insert(row) {
        assert.equal(table, 'admin_push_events');
        if (claims.has(row.event_key)) return { error: { code: '23505' } };
        claims.add(row.event_key); return { error: null };
      },
      then(resolve, reject) {
        const result = failTable === table ? { data: null, error: { message: 'Unavailable' } } : {
          data: rows[table].filter(row => filters.every(f => f(row))).map(row => Object.fromEntries(fields.map(key => [key, row[key]]))), error: null
        };
        return Promise.resolve(result).then(resolve, reject);
      }
    };
    return query;
  }};
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync('lib/instant-stock-notification.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mocks = {
    'server-only': {},
    '@/lib/admin-push': { notifyAdminsByPush: async (key, message) => { sent.push.push({ key, ...message }); } },
    '@/lib/email': { ORDER_NOTIFICATION_EMAIL: 'test@example.invalid', sendEmail: async message => { sent.email.push(message); } },
    '@/lib/supabase/admin': { createAdminClient: () => db }
  };
  vm.runInNewContext(source, {
    exports, require: name => { assert(name in mocks, name); return mocks[name]; },
    process: { env: { TELEGRAM_BOT_TOKEN: 'test-token', TELEGRAM_CHAT_ID: 'test-chat', NEXT_PUBLIC_SITE_URL: 'https://example.invalid' } },
    fetch: async (_url, init) => { sent.telegram.push(JSON.parse(init.body)); return { ok: true }; },
    console: { error: (...args) => errors.push(args) }
  });
  return { run: () => exports.notifySoldOutInstantOptions('order'), sent, claims, reads, errors };
}
function noAlerts(f) {
  for (const channel of Object.values(f.sent)) assert.equal(channel.length, 0);
  assert.equal(f.claims.size, 0);
}

test('Manual and supplier range order snapshots never trigger fixed-voucher sold-out alerts', async () => {
  for (const mode of ['RANGE_MANUAL', 'RANGE_SUPPLIER']) {
    // Snapshot exclusion also holds if the current option metadata has changed.
    const f = fixture({ items: [item(range, mode)], options: [{ ...fixed, id: range.id }] });
    await f.run(); noAlerts(f); assert.deepEqual(f.reads, ['order_items']);
  }
});

test('Range and custom-value options without a fulfillment snapshot are excluded', async () => {
  for (const option of [range, { ...range, is_custom_value: false }, { ...range, option_type: 'OTHER' }]) {
    const f = fixture({ items: [item(option)], options: [option] });
    await f.run(); noAlerts(f); assert(!f.reads.includes('products'));
  }
});

test('A depleted fixed denomination still alerts on all channels in a mixed range order', async () => {
  const f = fixture({ items: [item(range, 'RANGE_MANUAL'), item(range), item(fixed), item(fixed)], options: [range, fixed] });
  await f.run(); assert.equal(f.claims.size, 1);
  for (const channel of Object.values(f.sent)) assert.equal(channel.length, 1);
  assert.match(f.sent.telegram[0].text, /100 INR/);
  assert.doesNotMatch(f.sent.telegram[0].text, /Range denomination/);
  assert.match(f.sent.email[0].subject, /100 INR/);
  assert.match(f.sent.push[0].body, /100 INR/);
});

test('Repeated callbacks keep the existing one-alert-per-order-and-option protection', async () => {
  const f = fixture(); await f.run(); await f.run();
  assert.equal(f.claims.size, 1);
  for (const channel of Object.values(f.sent)) assert.equal(channel.length, 1);
});

test('In-stock, manual-delivery and missing-option items do not send sold-out alerts', async () => {
  for (const setup of [
    { options: [{ ...fixed, stock_quantity: 1 }] },
    { products: [{ ...product, delivery_type: 'MANUAL' }] },
    { items: [{ ...item(fixed), product_option_id: null }] },
    { items: [] }
  ]) {
    const f = fixture(setup); await f.run(); noAlerts(f);
  }
});

test('Stock lookup failures do not turn into sold-out alerts or block the caller', async () => {
  for (const failTable of ['order_items', 'product_options', 'products']) {
    const f = fixture({ failTable }); await f.run(); noAlerts(f); assert.equal(f.errors.length, 1);
  }
});
