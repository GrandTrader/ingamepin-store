const assert = require('node:assert/strict');
const fs = require('node:fs');
const { PGlite } = require('@electric-sql/pglite');
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const product = id(1), buyer = id(10), other = id(11);
const one = (option = 100, quantity = 1, customValue) => ({ productOptionId: id(option), quantity, ...(customValue == null ? {} : { customValue }) });

(async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,email text);
      create table products(id uuid primary key);
      create table product_options(id uuid primary key,product_id uuid,denomination numeric,denomination_currency text);
      create table orders(id uuid primary key default gen_random_uuid(),customer_id uuid,customer_email text,
        status text default 'PENDING_PAYMENT',created_at timestamptz default now(),paid_at timestamptz);
      create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid references orders on delete cascade,
        product_id uuid,product_option_id uuid,denomination numeric,custom_value numeric,quantity int);
      create function create_store_order(p_name text,p_email text,p_phone text,p_method text,p_items jsonb,p_note text)
      returns jsonb language plpgsql as $$ declare oid uuid; item jsonb; opt product_options; begin
        insert into orders(customer_email) values(lower(btrim(p_email))) returning id into oid;
        for item in select * from jsonb_array_elements(p_items) loop
          select * into strict opt from product_options where id=(item->>'productOptionId')::uuid;
          insert into order_items(order_id,product_id,product_option_id,denomination,custom_value,quantity)
          values(oid,opt.product_id,opt.id,opt.denomination,(item->>'customValue')::numeric,(item->>'quantity')::int);
        end loop;
        return jsonb_build_object('id',oid);
      end $$;
    `);
    const source = fs.readFileSync('supabase/migrations/20260928_140000_business_kyb.sql', 'utf8');
    const start = source.indexOf('create function public.create_business_checked_order(');
    await db.exec(source.slice(start, source.indexOf('$$;', start) + 3));
    for (const file of ['20260801_100000_add_product_purchase_restrictions.sql', '20261002_010000_purchase_restriction_periods_and_exemptions.sql'])
      await db.exec(fs.readFileSync('supabase/migrations/' + file, 'utf8'));
    const migration = fs.readFileSync('supabase/migrations/20261013_190000_denomination_purchase_limits.sql', 'utf8');
    await db.exec(migration); await db.exec(migration);
    await db.query('insert into products values($1)', [product]);
    await db.query('insert into auth.users values($1,$2),($3,$4)', [buyer, 'buyer@example.com', other, 'other@example.com']);
    for (const [key, value] of [[100, 1000], [200, 2000], [300, 3000], [400, 1]])
      await db.query("insert into product_options values($1,$2,$3,'INR')", [id(key), product, value]);
    await db.query("insert into product_purchase_restrictions(product_id,is_enabled,weekly_limit,identity_mode) values($1,true,3000,'ACCOUNT_EMAIL')", [product]);
    assert.equal((await db.query('select one_per_denomination from product_purchase_restrictions')).rows[0].one_per_denomination, false);
    await db.exec('update product_purchase_restrictions set one_per_denomination=true');
    const call = async (items, user = buyer, email = 'buyer@example.com', ip = '192.0.2.1') =>
      (await db.query("select create_purchase_checked_order('Buyer',$1,'','wallet',$2,null,$3,null,$4) as result", [email, JSON.stringify(items), user, ip])).rows[0].result.id;
    const reset = async () => db.exec("delete from orders; delete from product_purchase_restriction_exemptions; update product_purchase_restrictions set is_enabled=true,one_per_denomination=true,weekly_limit=3000,identity_mode='ACCOUNT_EMAIL',reset_mode='ROLLING_7_DAYS'");
    const count = async () => Number((await db.query('select count(*) n from orders')).rows[0].n);

    await call([one(100), one(200)]);
    assert.equal(await count(), 1, 'Distinct denominations fit the total cap');
    await assert.rejects(call([one(100)]), /Only one of each/);
    await assert.rejects(call([one(300)]), /Purchase limit reached/);
    assert.equal(await count(), 1, 'Rejected transactions leave no partial orders');
    await reset();
    await assert.rejects(call([one(100, 2)]), /Only one of each/);
    await assert.rejects(call([one(100), one(100)]), /Only one of each/);
    assert.equal(await count(), 0);

    // Different identities can buy the same denomination. Neither a changed
    // email on the same account nor a second account using the email bypasses it.
    await call([one()]);
    await assert.rejects(call([one()], buyer, 'changed@example.com'), /Only one of each/);
    await assert.rejects(call([one()], other, 'BUYER@example.com'), /Only one of each/);
    await call([one()], other, 'other@example.com');
    await reset();
    await db.exec("update product_purchase_restrictions set identity_mode='ACCOUNT_EMAIL_IP'");
    await call([one()]);
    await assert.rejects(call([one()], other, 'other@example.com'), /Only one of each/);
    await call([one()], other, 'other@example.com', '192.0.2.2');
    await reset();
    await db.exec("update product_purchase_restrictions set identity_mode='IP'");
    await assert.rejects(call([one()], buyer, 'buyer@example.com', null), /Unable to verify/);
    await call([one()]);
    await call([one()], buyer, 'buyer@example.com', '192.0.2.2');

    for (const days of [1, 7, 30]) {
      await reset();
      await db.query('update product_purchase_restrictions set reset_mode=$1', [`ROLLING_${days}_DAY${days === 1 ? '' : 'S'}`]);
      const oid = await call([one()]);
      await db.query("update orders set status='DELIVERED',paid_at=now() where id=$1", [oid]);
      await assert.rejects(call([one()]), /Only one of each/);
      await db.query("update orders set paid_at=now()-($1*interval '1 day') where id=$2", [days + 1, oid]);
      await call([one()]);
    }
    await reset();
    await db.exec("update product_purchase_restrictions set reset_mode='CALENDAR_WEEK'");
    const oldWeek = await call([one()]);
    await db.query("update orders set created_at=(date_trunc('week',now() at time zone 'UTC') at time zone 'UTC')-interval '1 second' where id=$1", [oldWeek]);
    await call([one()]);

    for (const status of ['CANCELLED', 'FAILED', 'REFUNDED', 'TRASHED']) {
      await reset();
      const oid = await call([one()]);
      await db.query('update orders set status=$1 where id=$2', [status, oid]);
      await call([one()]);
      await assert.rejects(db.query("update orders set status='PAID',paid_at=now() where id=$1", [oid]), /Only one of each/);
    }
    await reset();
    await db.query('insert into product_purchase_restriction_exemptions(product_id,user_id) values($1,$2)', [product, buyer]);
    await call([one(100), one(200), one(300)]);
    await assert.rejects(call([one()]), /Only one of each/, 'Exemption only removes the value cap');
    await reset();
    await call([one(400, 1, 1000), one(400, 1, 2000)]);
    await assert.rejects(call([one(400, 1, '1000.00')]), /Only one of each/);

    // Deferred enforcement protects transactions that create orders through a
    // different channel, then attach trusted identity before commit (B2B).
    await reset();
    const portalStyle = async () => {
      await db.exec('begin');
      try {
        const oid = (await db.query("select create_business_checked_order('Buyer','buyer@example.com','','wallet',$1,null,$2) result", [JSON.stringify([one()]), buyer])).rows[0].result.id;
        await db.query("update orders set customer_id=$1,customer_ip='192.0.2.1',status='PAID',paid_at=now() where id=$2", [buyer, oid]);
        await db.exec('commit');
      } catch (error) { await db.exec('rollback'); throw error; }
    };
    await portalStyle();
    await assert.rejects(call([one()]), /Only one of each/, 'Retail counts B2B purchases');
    await assert.rejects(portalStyle(), /Only one of each/);
    assert.equal(await count(), 1);
    await reset();
    const results = await Promise.allSettled([call([one()]), call([one()])]);
    assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
    assert.equal(await count(), 1);

    // Existing paid orders continue fulfillment when rules are enabled later.
    await reset();
    await db.exec('update product_purchase_restrictions set one_per_denomination=false');
    const legacy = await call([one(100, 2)]);
    await db.query("update orders set status='PAID',paid_at=now() where id=$1", [legacy]);
    await db.exec('update product_purchase_restrictions set one_per_denomination=true');
    await db.query("update orders set status='DELIVERED' where id=$1", [legacy]);
    await assert.rejects(call([one()]), /Only one of each/);

    const grants = await db.query("select proname,has_function_privilege('anon',oid,'execute') a,has_function_privilege('authenticated',oid,'execute') u from pg_proc where proname in ('create_purchase_checked_order','assert_order_denomination_limits','guard_order_denomination_limits')");
    assert(grants.rows.every(row => !row.a && !row.u));
    console.log('PASS denomination limits: distinct values, duplicate lines, cross-order/channel history, identity, all reset periods, pending/cancelled orders, exemptions, range amounts, rollback and restricted privileges');
  } finally { await db.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
