const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
function load(file, imports = {}) {
  const mod = { exports: {} };
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText;
  new Function('exports', 'require', 'module', code)(mod.exports, name => name in imports ? imports[name] : require(name), mod);
  return mod.exports;
}
const customerA = '11111111-1111-4111-8111-111111111111';
const customerB = '22222222-2222-4222-8222-222222222222';
function setup(options = {}) {
  const queries = [], identityIds = [], sessionOptions = [];
  let adminCreated = 0;
  const customers = {
    [customerA]: { id: customerA, email: 'nicolas@example.com', user_metadata: { full_name: 'Nicolas' } },
    [customerB]: { id: customerB, email: 'mary@example.com', user_metadata: { full_name: 'Mary' } },
    ...options.customers,
  };
  const rows = options.rows || Array.from({ length: 132 }, (_, i) => ({
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-' + String(i + 1).padStart(12, '0'),
    user_id: i < 127 ? customerA : customerB, transaction_type: i % 2 ? 'CREDIT' : 'DEBIT',
    amount: 12.5, balance_before: 100, balance_after: i % 2 ? 112.5 : 87.5,
    description: i % 2 ? 'Refund credited' : 'Store order payment', reference_id: 'ORDER-' + (i + 1),
    created_at: new Date(Date.UTC(2026, 9, 17, 12) - i * 3600000).toISOString(),
  }));
  const wallets = [{ user_id: customerA, balance: 90.31, currency: 'USD' }, { user_id: customerB, balance: 65, currency: 'EUR' }];
  function from(table) {
    const info = { table, filters: [], ordering: [] }; queries.push(info);
    const query = {
      select(fields, opts) { info.fields = fields; info.options = opts; return query; },
      eq(key, value) { info.filters.push(['eq', key, value]); return query; },
      in(key, value) { info.filters.push(['in', key, value]); return query; },
      gte(key, value) { info.filters.push(['gte', key, value]); return query; },
      lt(key, value) { info.filters.push(['lt', key, value]); return query; },
      ilike(key, value) { info.filters.push(['ilike', key, value]); return query; },
      order(key, opts) { info.ordering.push([key, opts]); return query; },
      range(first, last) { info.range = [first, last]; return query; },
      then(resolve, reject) {
        let data = [...(table === 'wallet_transactions' ? rows : wallets)];
        for (const [op, key, value] of info.filters) {
          if (op === 'eq') data = data.filter(row => row[key] === value);
          if (op === 'in') data = data.filter(row => value.includes(row[key]));
          if (op === 'gte') data = data.filter(row => row[key] >= value);
          if (op === 'lt') data = data.filter(row => row[key] < value);
          if (op === 'ilike') data = data.filter(row => String(row[key]).toLowerCase().includes(value.slice(1, -1).replace(/\\([\\%_])/g, '$1').toLowerCase()));
        }
        for (const [key, opts] of [...info.ordering].reverse()) data.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (opts.ascending ? 1 : -1));
        const count = data.length;
        if (info.range) data = data.slice(info.range[0], info.range[1] + 1);
        const error = options.failTable === table ? { message: 'PRIVATE DATABASE FAILURE' } : null;
        return Promise.resolve({ data, count: options.noCount ? null : count, error }).then(resolve, reject);
      },
    }; return query;
  }
  const session = {
    auth: { getUser: async () => ({ data: { user: options.loggedOut ? null : { id: 'admin' } } }) },
    from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => ({ data: options.denied ? null : { user_id: 'admin' }, error: options.accessError ? { message: 'error' } : null }) }),
  };
  const admin = { from, auth: { admin: { getUserById: async id => {
    identityIds.push(id);
    return { data: { user: customers[id] || null }, error: options.identityError ? { status: 503 } : null };
  } } } };
  const page = load('app/admin/wallet/activity/page.tsx', {
    'next/link': { default: ({ children, prefetch, ...props }) => React.createElement('a', props, children) },
    'next/form': { default: ({ children, prefetch, ...props }) => React.createElement('form', { ...props, method: 'get' }, children) },
    'next/navigation': { redirect(url) { throw Error('redirect:' + url); }, notFound() { throw Error('404'); } },
    '@/lib/supabase/admin-session': { createClient: async opts => { sessionOptions.push(opts); if (options.mfaRequired) throw Error('redirect:/admin/login/verify'); return session; } },
    '@/lib/supabase/admin': { createAdminClient: () => { adminCreated++; return admin; } },
    '@/lib/business-portal': load('lib/business-portal.ts'),
    '@/lib/wallet-receipt': load('lib/wallet-receipt.ts'),
    './WalletActivityExport': load('app/admin/wallet/activity/WalletActivityExport.tsx'),
    '../../AdminSidebar': { default: () => React.createElement('aside', { className: 'hidden md:block md:w-[200px] md:shrink-0' }, 'Admin') },
  }).default;
  return { queries, identityIds, sessionOptions, rows, adminCreated: () => adminCreated, render: async (params = {}) => renderToStaticMarkup(await page({ searchParams: Promise.resolve(params) })) };
}
module.exports = { setup, customerA, customerB };
if (require.main === module) {
  test('signed-out, non-admin, role lookup failures and missing MFA cannot access privileged data', async () => {
    for (const opt of [{ loggedOut: true }, { denied: true }, { accessError: true }, { mfaRequired: true }]) {
      const f = setup(opt); await assert.rejects(f.render(), /redirect:/); assert.equal(f.adminCreated(), 0); assert.equal(f.queries.length, 0);
    }
  });
  test('all customers view pages across the ledger and resolves only identities on the current page', async () => {
    const f = setup(); const html = await f.render({ page: '6' });
    assert.match(html, /All customers/); assert.match(html, /126–132 of 132 activities/);
    assert.match(html, /nicolas@example.com/); assert.match(html, /mary@example.com/); assert.match(html, /€12.50/);
    assert.equal(f.identityIds.length, 2); assert.deepEqual(f.sessionOptions, [{ reuseVerifiedUser: true }]);
    const q = f.queries.find(q => q.table === 'wallet_transactions');
    assert.deepEqual(q.range, [125, 149]); assert.equal(q.options.count, 'exact'); assert.deepEqual(q.filters, []);
    assert.deepEqual(q.ordering, [['created_at', { ascending: false }], ['id', { ascending: false }]]);
    assert.ok(html.includes('/admin/customers/' + customerB + '/transactions/' + f.rows[131].id));
  });
  test('selected customer can reach entries beyond the previous 100-row limit without another customer data', async () => {
    const f = setup(); const html = await f.render({ customer: customerA, page: '5' });
    assert.match(html, /101–125 of 127 activities/); assert.match(html, /ORDER-125/); assert.doesNotMatch(html, /ORDER-126|mary@example.com/);
    assert.match(html, /Current wallet balance/); assert.match(html, /\$90.31/);
    assert.deepEqual(f.identityIds, [customerA]); assert.ok(f.queries[0].filters.some(x => x[1] === 'user_id' && x[2] === customerA));
    assert.ok(html.includes('customer=' + customerA + '&amp;page=6'));
  });
  test('date filters use inclusive India dates, type is scoped and pagination retains filters', async () => {
    const f = setup(); const html = await f.render({ customer: customerA, from: '2026-10-12', to: '2026-10-17', type: 'DEBIT', reference: 'ORDER-' });
    const q = f.queries[0];
    assert.ok(q.filters.some(x => x[0] === 'gte' && x[2] === '2026-10-11T18:30:00.000Z'));
    assert.ok(q.filters.some(x => x[0] === 'lt' && x[2] === '2026-10-17T18:30:00.000Z'));
    assert.ok(q.filters.some(x => x[1] === 'transaction_type' && x[2] === 'DEBIT'));
    assert.match(html, /customer=.*from=2026-10-12&amp;to=2026-10-17&amp;type=DEBIT&amp;reference=ORDER-&amp;page=2/);
    assert.doesNotMatch(html, /Refund credited/);
    assert.match(html, /name="customer" value="11111111/);
  });
  test('literal reference search escapes database wildcard characters', async () => {
    const f = setup(); await f.render({ reference: 'PAY_100%\\ref' });
    assert.equal(f.queries[0].filters.find(x => x[0] === 'ilike')[2], '%PAY\\_100\\%\\\\ref%');
  });
  test('invalid customer filters never fall back to all customers', async () => {
    for (const customer of ['bad', '', [customerA, customerB]]) {
      const f = setup(); await assert.rejects(f.render({ customer }), /404/); assert.equal(f.adminCreated(), 0);
    }
    const f = setup(); await assert.rejects(f.render({ customer: '33333333-3333-4333-8333-333333333333' }), /404/); assert.equal(f.queries.length, 0);
  });
  test('invalid or reversed dates show a useful error and do not query the full ledger', async () => {
    for (const params of [{ from: '2026-02-30' }, { to: 'invalid' }, { from: '2026-10-17', to: '2026-10-12' }]) {
      const f = setup(); const html = await f.render(params); assert.match(html, /role="alert"/); assert.equal(f.queries.length, 0); assert.doesNotMatch(html, /No wallet activity matches/);
    }
  });
  test('ledger and currency failures are errors instead of false empty history or incorrect amounts', async () => {
    for (const opts of [{ failTable: 'wallet_transactions' }, { failTable: 'customer_wallets' }, { noCount: true }]) {
      await assert.rejects(setup(opts).render(), e => /Unable to load/.test(e.message) && !e.message.includes('PRIVATE'));
    }
  });
  test('out-of-range pages redirect to the last page without losing the customer scope', async () => {
    const f = setup(); await assert.rejects(f.render({ customer: customerA, page: '99', type: 'DEBIT' }), new RegExp('redirect:/admin/wallet/activity\\?customer=' + customerA + '&type=DEBIT&page=3'));
  });
  test('an empty ledger has no false amounts or next page', async () => {
    const f = setup({ rows: [] }); const html = await f.render();
    assert.match(html, /0 activities/); assert.match(html, /No wallet activity matches these filters/); assert.match(html, /Page 1 of 1/); assert.doesNotMatch(html, /Next →|\$0.00/); assert.equal(f.identityIds.length, 0);
  });
  test('temporary customer-directory failures preserve financial entries and warn clearly', async () => {
    const html = await setup({ identityError: true }).render(); assert.match(html, /Some customer details are temporarily unavailable/); assert.match(html, /ORDER-1/); assert.match(html, /12.50/);
    await assert.rejects(setup({ identityError: true }).render({ customer: customerA }), /Unable to load this customer/);
  });
  test('customer metadata is escaped and null balances are not presented as zero', async () => {
    const f = setup({ customers: { [customerA]: { id: customerA, email: 'x@example.com', user_metadata: { full_name: '<script>alert(1)</script>' } } }, rows: [{ id: 'row', user_id: customerA, amount: 10, transaction_type: 'CREDIT', balance_before: null, balance_after: null, created_at: '2026-10-17T12:00:00Z' }] });
    const html = await f.render(); assert.doesNotMatch(html, /<script>/); assert.match(html, /&lt;script&gt;/); assert.doesNotMatch(html, /\$0.00/);
  });
}
