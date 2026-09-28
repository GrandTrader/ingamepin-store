const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { PGlite } = require(process.env.PGLITE_PATH || '@electric-sql/pglite');

function load(file, mocks = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  vm.runInNewContext(js, { exports, require: name => {
    if (name in mocks) return mocks[name];
    throw Error('Unexpected dependency: ' + name);
  }, console, Map, Set });
  return exports;
}

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated;
      create table orders(order_number text not null unique);
      insert into orders values ('IGP-20260926-816D21C7'), ('IGP2809202612345678');`);
    const migration = fs.readFileSync('supabase/migrations/20260928_110000_ip_order_numbers.sql', 'utf8');
    await db.exec(migration);
    await db.exec(migration); // Safe to rerun.
    const one = async sql => (await db.query(sql)).rows[0];
    const prefix = (await one("select 'IP' || to_char(clock_timestamp() at time zone 'Asia/Kolkata','YYYYMMDD') as prefix")).prefix;
    await db.exec('select setseed(0.42)');
    const first = (await one('select next_store_order_number() as number')).number;
    assert.match(first, new RegExp('^' + prefix + '[1-9][0-9]{5}$'));
    await db.query('insert into orders values ($1)', [first]);
    // Replaying the random stream forces a collision on the first attempt.
    await db.exec('select setseed(0.42)');
    const retry = (await one('select next_store_order_number() as number')).number;
    assert.notEqual(retry, first);
    await db.exec(`do $$ begin for i in 1..2000 loop
      insert into orders values(next_store_order_number());
    end loop; end $$;`);
    assert.equal(Number((await one('select count(distinct order_number) as n from orders')).n), 2003);
    const legacy = await db.query("select order_number from orders where order_number like 'IGP%' order by order_number");
    assert.deepEqual(legacy.rows.map(r => r.order_number), ['IGP-20260926-816D21C7', 'IGP2809202612345678']);
    assert.equal((await one("select has_function_privilege('anon','next_store_order_number()','execute') as allowed")).allowed, false);

    const { orderSearchFilter } = load('lib/admin-orders-query.ts');
    for (const number of [first, ...legacy.rows.map(r => r.order_number)]) {
      assert.ok(orderSearchFilter(number).includes(`order_number.ilike.\"%${number}%\"`));
      let requested;
      const orderQuery = { select() { return this; }, eq(field, value) { requested = value; return this; },
        maybeSingle: async () => ({ data: requested === number ? { id: 'order', order_number: number, customer_email: 'owner@example.com' } : null }) };
      const { POST } = load('app/api/orders/lookup/route.ts', {
        'next/server': { NextResponse: { json: (body, options) => ({ body, status: options?.status ?? 200 }) } },
        '@/lib/supabase/admin': { createAdminClient: () => ({ from: table => table === 'orders' ? orderQuery : {
          select() { return this; }, eq() { return this; }, order: async () => ({ data: [] }),
        } }) },
        '@/lib/delivery-receipts': { getAuthorizedDeliveryReceipts: async () => new Map() },
        '@/lib/delivered-codes': { getAllDeliveredCodes: async () => [] },
      });
      const result = await POST({ json: async () => ({ orderNumber: ' ' + number.toLowerCase() + ' ', email: 'owner@example.com' }) });
      assert.equal(result.status, 200);
      assert.equal(result.body.order.orderNumber, number);
      assert.equal((await POST({ json: async () => ({ orderNumber: number, email: 'wrong@example.com' }) })).status, 404);
    }
    console.log('Passed: new format, India date, collision retry, 2,000 unique orders, idempotent migration, permissions, legacy preservation and old/new customer/admin lookups.');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
