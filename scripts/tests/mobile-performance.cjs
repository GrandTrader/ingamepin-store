const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const test = require('node:test');

function load(file, mocks) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText;
  vm.runInNewContext(js, { module, exports: module.exports, require: name => name in mocks ? mocks[name] : require(name), console });
  return module.exports;
}
function dashboard(user, params, options = {}) {
  const queries = [];
  function from(table) {
    const q = { table, filters: [], head: false };
    const builder = {};
    for (const method of ['select', 'eq', 'in', 'order', 'range', 'limit', 'maybeSingle']) {
      builder[method] = (...args) => {
        if (method === 'select') { q.columns = args[0]; q.head = !!args[1]?.head; }
        if (method === 'eq' || method === 'in') q.filters.push([method, ...args]);
        if (method === 'range') q.range = args;
        return builder;
      };
    }
    builder.then = (resolve, reject) => {
      queries.push(q);
      const count = q.filters.some(f => f[1] === 'status' && f[0] === 'in') ? 7 : 12;
      return Promise.resolve({ data: table === 'customer_wallets' ? {balance: 0, currency: 'USD'} : [], count, error: options.fail && table === 'orders' ? {message: 'offline'} : null }).then(resolve, reject);
    };
    return builder;
  }
  const client = { from, auth: {getUser: async () => ({data: {user}})} };
  const page = load('app/account/dashboard/page.tsx', {
    '@/lib/supabase/server': {createClient: async () => client},
    '@/lib/supabase/admin': {createAdminClient: () => client},
    'next/navigation': {redirect: url => {throw new Error('REDIRECT:' + url)}},
    'next/link': {__esModule: true, default: 'a'},
    './Dashboard.module.css': {__esModule: true, default: {}},
    '../actions': {customerLogout: () => {}},
    '@/components/InstallCustomerAppButton': {__esModule: true, default: () => null},
    '../CustomerPasskeyReminder': {__esModule: true, default: () => null},
  });
  return {queries, result: page.default({searchParams: Promise.resolve(params)})};
}
const user = {id: 'customer', email: 'OWNER@EXAMPLE.TEST', user_metadata: {}};
test('dashboard fetches only the requested five orders and counts codes without reading values', async () => {
  const run = dashboard(user, {page: '2', status: 'processing'}); await run.result;
  const rows = run.queries.find(q => q.table === 'orders' && !q.head);
  assert.deepEqual(Array.from(rows.range), [5, 9]);
  assert(rows.filters.some(f => f[0] === 'in' && JSON.stringify(f[2]) === '["PAID","PROCESSING"]'));
  for (const q of run.queries.filter(q => q.table === 'orders')) assert(q.filters.some(f => f[1] === 'customer_email' && f[2] === 'owner@example.test'));
  const codes = run.queries.find(q => q.table === 'gift_card_codes');
  assert(codes.head); assert(!codes.columns.split(',').includes('code'));
  assert(codes.filters.some(f => f[1] === 'order_items.orders.customer_email' && f[2] === 'owner@example.test'));
});
test('dashboard redirects unsigned users before reading data', async () => {
  const run = dashboard(null, {}); await assert.rejects(run.result, /REDIRECT:\/account/); assert.equal(run.queries.length, 0);
});
test('dashboard clamps out-of-range pages and handles query failures', async () => {
  await assert.rejects(dashboard(user, {page: '99', status: 'processing'}).result, /status=processing&page=2/);
  await assert.rejects(dashboard(user, {}, {fail: true}).result, /Unable to load account orders/);
});
test('English and admin routes never mount the translation engine', () => {
  let language = 'en', pathname = '/';
  const wrapper = load('components/WebsiteTranslator.tsx', {
    'next/dynamic': {__esModule: true, default: () => 'translator'},
    'next/navigation': {usePathname: () => pathname},
    './StorePreferences': {useStorePreferences: () => ({language})},
  }).default;
  assert.equal(wrapper(), null); language = 'ru'; assert(wrapper()); pathname = '/admin/products'; assert.equal(wrapper(), null);
});
