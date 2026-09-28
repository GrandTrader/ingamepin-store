const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require(process.env.PGLITE_PATH || '@electric-sql/pglite');
(async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create role service_role;
      create type payment_method as enum ('UPI','BINANCE_PAY','NOWPAYMENTS','PALLY','FREEKASSA','USDT_DIRECT','WALLET');
      create table orders(id uuid primary key, order_number text unique, customer_name text, customer_email text,
        customer_phone text, customer_note text, currency text, subtotal numeric, discount numeric, total numeric, status text);
      create table products(id uuid primary key, name text, status text, is_bulk_order boolean,
        minimum_quantity int, maximum_quantity int, allows_custom_value boolean, minimum_custom_value numeric,
        maximum_custom_value numeric, allows_player_id_topup boolean);
      create table product_options(id uuid primary key, product_id uuid, is_active boolean, minimum_quantity int,
        maximum_quantity int, stock_quantity int, option_name text, selling_price numeric, denomination numeric, platform text);
      create table product_customer_fields(id uuid, label text, field_type text, is_required boolean, product_id uuid,
        sort_order int, created_at timestamptz);
      create table order_items(order_id uuid, product_id uuid, product_option_id uuid, product_name text, option_name text,
        denomination numeric, platform text, custom_value numeric, fulfillment_mode text, player_id text,
        customer_information jsonb, order_type text, quantity int, unit_price numeric, total_price numeric);
      create table payments(order_id uuid, method payment_method, status text, amount numeric, currency text);
      insert into products values ('00000000-0000-4000-8000-000000000001','Test card','ACTIVE',false,1,10,false,null,null,false);
      insert into product_options values ('00000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',true,null,null,100,'10 USD',10,10,'Test');`);
    const legacySql = fs.readFileSync('supabase/migrations/20260802_120000_use_product_quantity_limits.sql','utf8');
    const start = legacySql.indexOf('create or replace function public.create_store_order(');
    const end = legacySql.indexOf('$$;', start) + 3;
    await db.exec(legacySql.slice(start,end));
    const signature = 'public.create_store_order(text,text,text,text,jsonb,text)';
    await db.exec(`revoke all on function ${signature} from public; grant execute on function ${signature} to service_role;`);
    const one = async (sql, params=[]) => (await db.query(sql,params)).rows[0];
    const create = async () => (await one(`select create_store_order('Test Customer','test@example.com','','wallet',
      '[{"productOptionId":"00000000-0000-4000-8000-000000000002","quantity":2}]',null) as result`)).result;
    const legacy = await create();
    assert.match(legacy.order_number,/^IGP-\d{8}-[A-F0-9]{8}$/);
    const generator = fs.readFileSync('supabase/migrations/20260928_110000_ip_order_numbers.sql','utf8');
    await db.exec(generator);
    // Reproduce the reported bug: changing only the generator leaves old checkout unchanged.
    assert.match((await create()).order_number,/^IGP-/);
    const before = (await one(`select pg_get_functiondef('${signature}'::regprocedure) as definition`)).definition;
    const repair = fs.readFileSync('supabase/migrations/20260928_120000_connect_checkout_order_numbers.sql','utf8');
    await db.exec(repair);
    await db.exec(repair);
    const after = (await one(`select pg_get_functiondef('${signature}'::regprocedure) as definition`)).definition;
    assert.equal(after, before.replace(/\bv_order_number\s*:=\s*[^;]+;/i,'v_order_number := public.next_store_order_number();'));
    const current = await create();
    assert.match(current.order_number,/^IP\d{8}[1-9]\d{5}$/);
    assert.equal(current.total,20);
    assert.equal((await one('select order_number from orders where id=$1',[current.id])).order_number,current.order_number);
    assert.equal(Number((await one('select amount from payments where order_id=$1',[current.id])).amount),20);
    assert.equal((await one('select order_number from orders where id=$1',[legacy.id])).order_number,legacy.order_number);
    assert.equal((await one(`select has_function_privilege('anon','${signature}','execute') as allowed`)).allowed,false);
    assert.equal((await one(`select has_function_privilege('service_role','${signature}','execute') as allowed`)).allowed,true);
    // Unexpected custom logic must fail without overwriting the function.
    const custom = after.replace('v_order_number := public.next_store_order_number();',"v_order_number := 'CUSTOM';");
    await db.exec(custom);
    await assert.rejects(db.exec(repair),/Unrecognized checkout number generator/);
    assert.equal((await one(`select pg_get_functiondef('${signature}'::regprocedure) as definition`)).definition,custom);
    console.log('Passed: reproduced legacy checkout bug, repaired actual checkout, matching saved/returned numbers, unchanged totals/payments/history/permissions, idempotence, unexpected-function protection.');
  } finally { await db.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
