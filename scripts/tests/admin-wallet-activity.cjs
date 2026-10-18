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
  const wallets = options.wallets ?? [{ user_id: customerA, balance: 90.31, currency: 'USD', created_at:'2019-01-01T00:00:00.000Z' }, { user_id: customerB, balance: 65, currency: 'EUR', created_at:'2019-01-01T00:00:00.000Z' }];
  function from(table) {
    const info = { table, filters: [], ordering: [] }; queries.push(info);
    const query = {
      select(fields, opts) { info.fields = fields; info.options = opts; return query; },
      eq(key, value) { info.filters.push(['eq', key, value]); return query; },
      in(key, value) { info.filters.push(['in', key, value]); return query; },
      gte(key, value) { info.filters.push(['gte', key, value]); return query; },
      lt(key, value) { info.filters.push(['lt', key, value]); return query; },
      lte(key, value) { info.filters.push(['lte', key, value]); return query; },
      or(value) { info.cursor = value; return query; },
      limit(value) { info.limit = value; return query; },
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
          if (op === 'lte') data = data.filter(row => row[key] <= value);
          if (op === 'ilike') data = data.filter(row => String(row[key]).toLowerCase().includes(value.slice(1, -1).replace(/\\([\\%_])/g, '$1').toLowerCase()));
        }
        if(info.cursor){const m=info.cursor.match(/^created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([^\)]+)\)$/);assert.ok(m);data=data.filter(r=>r.created_at<m[1]||(r.created_at===m[1]&&r.id<m[3]));}
        for (const [key, opts] of [...info.ordering].reverse()) data.sort((a, b) => String(a[key]).localeCompare(String(b[key])) * (opts.ascending ? 1 : -1));
        const count = data.length;
        if (info.range) data = data.slice(info.range[0], info.range[1] + 1);
        if (info.limit) data = data.slice(0, Math.min(info.limit, options.databaseCap ?? Infinity));
        const error = options.failTable === table || (options.failSummary && table === 'wallet_transactions' && !info.range) ? { message: 'PRIVATE DATABASE FAILURE' } : null;
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
    '@/lib/wallet-activity-summary':load('lib/wallet-activity-summary.ts'),'@/lib/wallet-activity-summary-data':load('lib/wallet-activity-summary-data.ts',{'server-only':{},'./wallet-activity-summary':load('lib/wallet-activity-summary.ts')}),
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

 function ledger(id,time,type,amount,before,after,user=customerA){return {id:'aaaaaaaa-aaaa-4aaa-8aaa-'+String(id).padStart(12,'0'),user_id:user,transaction_type:type,amount,balance_before:before,balance_after:after,description:'Wallet activity',reference_id:'ORDER-'+id,order_id:null,created_at:time};}
 const dates={from:'2020-10-17',to:'2020-10-17'};
 function coherentRows(){return [
  ledger(1,'2020-10-16T18:29:59.999Z','CREDIT',100,0,100),
  ledger(2,'2020-10-16T18:30:00.000Z','CREDIT',50,100,150),
  ledger(3,'2020-10-17T12:00:00.000Z','DEBIT',30,150,120),
  ledger(4,'2020-10-17T18:29:59.999Z','REFUND',20,120,140),
  ledger(5,'2020-10-17T18:30:00.000Z','DEBIT',80,140,60)
 ];}
 function summaryValues(html){const section=html.match(/<section aria-label="Wallet summary"[\s\S]*?<\/section>/)?.[0]||'';return [...section.matchAll(/<dd[^>]*>([^<]*)<\/dd>/g)].map(m=>m[1]);}
 test('page summary matches CSV totals at inclusive IST boundaries, includes refunds and ignores detail filters',async()=>{
  const rows=coherentRows(),params={customer:customerA,...dates,type:'DEBIT',reference:'ORDER-3'},f=setup({rows}),html=await f.render(params);
  assert.deepEqual(summaryValues(html),['$100.00','$70.00','$30.00','$140.00']);assert.match(html,/Credits include refunds/);assert.match(html,/1–1 of 1 activities/);
  const exports=require('./admin-wallet-export.cjs');const response=await exports.setup({rows}).get(new URLSearchParams(params));const csv=exports.parseCsv(await response.text());const summary=csv.find(row=>row[0]===customerA);
  assert.deepEqual(summaryValues(html),summary.slice(4,8).map(value=>'$'+value));
  assert.ok(f.queries.filter(q=>q.limit).every(q=>!q.filters.some(x=>x[0]==='gte'||x[1]==='transaction_type'||x[0]==='ilike')));
 });
 test('page summary includes more than 1000 transactions and is independent of pagination',async()=>{
  const rows=Array.from({length:1205},(_,i)=>ledger(i+1,new Date(Date.UTC(2020,9,17,12)+i*1000).toISOString(),'CREDIT','0.01',(i/100).toFixed(2),((i+1)/100).toFixed(2)));
  for(const page of ['1','49']){const f=setup({rows,databaseCap:137}),html=await f.render({customer:customerA,...dates,page});assert.deepEqual(summaryValues(html),['$0.00','$12.05','$0.00','$12.05']);assert.ok(f.queries.filter(q=>q.limit).length>8);}
 });
 test('global summary includes inactive wallets, separates currencies and only resolves visible identities',async()=>{
  const rows=[...coherentRows(),ledger(6,'2020-10-15T12:00:00.000Z','CREDIT',10.10,0,10.10,customerB)];const f=setup({rows}),html=await f.render(dates);
  assert.deepEqual(summaryValues(html),['€10.10','€0.00','€0.00','€10.10','$100.00','$70.00','$30.00','$140.00']);assert.deepEqual(f.identityIds,[customerA]);
  assert.ok(f.queries.filter(q=>q.table==='customer_wallets').some(q=>q.filters.some(x=>x[0]==='in'&&x[2].includes(customerB))));
 });
 test('empty date ranges retain historical balances and unrecorded balances are not presented as zero',async()=>{
  const html=await setup({rows:coherentRows()}).render({customer:customerA,from:'2020-10-19',to:'2020-10-20'});assert.deepEqual(summaryValues(html),['$60.00','$0.00','$0.00','$60.00']);assert.match(html,/0 activities/);
  const unknown=await setup({rows:[]}).render({customer:customerA,...dates});assert.deepEqual(summaryValues(unknown),['Not recorded','$0.00','$0.00','Not recorded']);
  const zero=await setup({rows:[],wallets:[{user_id:customerA,balance:0,currency:'USD',created_at:'2019-01-01T00:00:00.000Z'}]}).render({customer:customerA,...dates});assert.deepEqual(summaryValues(zero),['$0.00','$0.00','$0.00','$0.00']);
 });
 test('summary failure preserves transaction list and shows an error instead of incorrect totals',async()=>{
  const html=await setup({rows:coherentRows(),failSummary:true}).render({customer:customerA,...dates});assert.match(html,/Unable to load the balance summary/);assert.match(html,/ORDER-3/);assert.doesNotMatch(html,/PRIVATE DATABASE/);assert.deepEqual(summaryValues(html),[]);
 });
 test('reset and invalid dates hide summary and do not scan the ledger for totals',async()=>{
  for(const params of [{},{from:'bad'},{from:'2020-10-17',to:'2020-10-16'}]){const f=setup(),html=await f.render(params);assert.deepEqual(summaryValues(html),[]);assert.ok(!f.queries.some(q=>q.limit));}
 });
 test('one-sided ranges display complete period totals and labels',async()=>{
  const first=await setup({rows:coherentRows()}).render({customer:customerA,to:dates.to});assert.deepEqual(summaryValues(first),['$0.00','$170.00','$30.00','$140.00']);assert.match(first,/Beginning of history/);
  const second=await setup({rows:coherentRows()}).render({customer:customerA,from:dates.from});assert.deepEqual(summaryValues(second),['$100.00','$70.00','$110.00','$60.00']);assert.match(second,/Today/);
 });

}
