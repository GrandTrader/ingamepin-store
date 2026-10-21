const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(file, mocks = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText, {
    exports, Date, AbortSignal, ...globals,
    require: (name) => {
      if (name in mocks) return mocks[name];
      if (name === 'server-only') return {};
      if (name === 'react' || name === 'react/jsx-runtime') return require(name);
      throw Error('Missing mock ' + name);
    },
  });
  return exports;
}

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function client(responses, calls = []) {
  return { from(table) {
    const call = { table, filters: [] };
    const query = {};
    for (const key of ['select', 'eq', 'in', 'gte', 'order', 'limit', 'abortSignal']) {
      query[key] = (...args) => { call.filters.push([key, ...args]); return query; };
    }
    query.then = (ok, fail) => {
      calls.push(call);
      const response = responses[calls.length - 1];
      return (typeof response === 'function' ? response(call) : Promise.resolve(response)).then(ok, fail);
    };
    return query;
  } };
}

const successCounts = () => [
  { count: 12, error: null }, { count: 2, error: null }, { count: 3, error: null },
  { data: [{ total: '12.50' }, { total: 20 }], error: null },
];

test('dashboard reads run concurrently and recent orders do not wait for totals', async () => {
  const api = load('lib/admin-dashboard.ts');
  const pending = [deferred(), deferred(), deferred(), deferred()];
  const calls = [];
  const db = client([...pending.map(p => p.promise), { data: [{ id: 'recent' }], error: null }], calls);
  let totalsReady = false;
  const summary = api.loadDashboardSummary(db).then(value => { totalsReady = true; return value; });
  const recent = await api.loadRecentDashboardOrders(db);
  assert.equal(calls.length, 5, 'All reads start without waiting for another result');
  assert.equal(totalsReady, false);
  assert.equal(recent.data[0].id, 'recent');
  successCounts().forEach((value, i) => pending[i].resolve(value));
  assert.deepEqual(JSON.parse(JSON.stringify(await summary)), { data: { orders: 12, reviews: 2, processing: 3, revenue: 32.5 } });
  for (const call of calls) assert(call.filters.find(f => f[0] === 'abortSignal')[1] instanceof AbortSignal);
  for (const call of calls.slice(0, 3)) {
    const [, columns, options] = call.filters.find(f => f[0] === 'select');
    assert.equal(columns, 'id'); assert.equal(options.head, true); assert.equal(options.count, 'exact');
  }
  assert.equal(calls[4].filters.find(f => f[0] === 'limit')[1], 5);
  assert.equal(calls[4].filters.find(f => f[0] === 'order')[1], 'created_at');
  assert.equal(calls[4].filters.find(f => f[0] === 'select')[1], 'id,order_number,customer_name,total,currency,status,created_at');
  assert(calls[3].filters.find(f => f[0] === 'gte')[2].endsWith('T00:00:00.000Z'));
});

test('database failures show retry errors instead of fabricated zeros or empty orders', async () => {
  const api = load('lib/admin-dashboard.ts');
  for (let i = 0; i < 4; i++) {
    const results = successCounts();
    results[i] = { error: { message: 'private database detail' }, data: null, count: null };
    const value = await api.loadDashboardSummary(client(results));
    assert(value.error); assert.equal(value.data, undefined); assert(!value.error.includes('private'));
  }
  const missingCount = successCounts(); missingCount[0].count = null;
  assert((await api.loadDashboardSummary(client(missingCount))).error);
  for (const response of [{ data: null, error: null }, { data: null, error: { message: 'offline' } }, () => Promise.reject(Error('offline'))]) {
    const value = await api.loadRecentDashboardOrders(client([response]));
    assert(value.error); assert.equal(value.data, undefined);
  }
  assert.equal((await api.loadRecentDashboardOrders(client([{ data: [], error: null }]))).data.length, 0);
});

test('slow database requests abort and return a recoverable error', async () => {
  const controller = new AbortController();
  const timeouts = [];
  const api = load('lib/admin-dashboard.ts', {}, { AbortSignal: { timeout(ms) { timeouts.push(ms); return controller.signal; } } });
  const blocked = call => new Promise((resolve, reject) => {
    call.filters.find(f => f[0] === 'abortSignal')[1].addEventListener('abort', () => reject(Error('Timed out')), { once: true });
  });
  const db = client([blocked, blocked, blocked, blocked, blocked]);
  const summary = api.loadDashboardSummary(db);
  const recent = api.loadRecentDashboardOrders(db);
  await new Promise(resolve => setImmediate(resolve));
  controller.abort();
  assert((await summary).error); assert((await recent).error);
  assert.deepEqual(timeouts, [10_000, 10_000]);
});

test('separate dashboard requests never share cached totals or order data', async () => {
  const api = load('lib/admin-dashboard.ts');
  const calls = [];
  const db = client([{ data: [{ id: 'first' }], error: null }, { data: [{ id: 'second' }], error: null }], calls);
  assert.equal((await api.loadRecentDashboardOrders(db)).data[0].id, 'first');
  assert.equal((await api.loadRecentDashboardOrders(db)).data[0].id, 'second');
  assert.equal(calls.length, 2);
});

function findComponent(node, name) {
  if (!node || typeof node !== 'object') return undefined;
  if (node.type?.name === name) return node;
  const children = node.props?.children;
  for (const child of Array.isArray(children) ? children : [children]) {
    const found = findComponent(child, name);
    if (found) return found;
  }
}

test('no privileged dashboard query can start before successful session and admin verification', async () => {
  for (const scenario of ['anonymous', 'not-admin', 'membership-error', 'session-error', 'admin']) {
    let services = 0, reads = 0, signedOut = 0;
    const noop = () => null;
    const Page = load('app/admin/page.tsx', {
      '@/components/NavigationLink': { default: noop },
      'next/navigation': { redirect: url => { throw Error('REDIRECT ' + url); } },
      './actions': { adminLogout: noop, sendTestEmail: noop },
      './AdminOrderLink': { default: noop }, './DashboardRetry': { default: noop },
      '@/components/InstallAdminAppButton': { default: noop },
      '@/lib/supabase/server': { createClient: async () => ({
        auth: {
          getUser: async () => { if (scenario === 'session-error') throw Error('Session check failed'); return { data: { user: scenario === 'anonymous' ? null : { id: 'owner', email: 'owner@example.test' } } }; },
          signOut: async () => { signedOut++; },
        },
        from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({
          data: scenario === 'not-admin' ? null : { role: 'OWNER' },
          error: scenario === 'membership-error' ? { message: 'offline' } : null,
        }) }) }) }),
      }) },
      '@/lib/supabase/admin': { createAdminClient: () => { services++; return {}; } },
      '@/lib/admin-dashboard': {
        loadDashboardSummary: () => { reads++; return new Promise(() => {}); },
        loadRecentDashboardOrders: () => { reads++; return new Promise(() => {}); },
      },
    }).default;
    const shell = Page({ searchParams: Promise.resolve({}) });
    assert.equal(services, 0, 'Static shell must not read private data');
    const content = findComponent(shell, 'DashboardContent');
    assert(content);
    if (scenario === 'admin') {
      await content.type(content.props);
      assert.equal(services, 1); assert.equal(reads, 2, 'Content returns while both independent sections are pending');
    } else {
      await assert.rejects(content.type(content.props), scenario === 'session-error' ? /Session check failed/ : /REDIRECT/);
      assert.equal(services, 0); assert.equal(reads, 0);
    }
    assert.equal(signedOut, ['not-admin', 'membership-error'].includes(scenario) ? 1 : 0);
  }
});
