/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { randomUUID } = require('node:crypto');
const { PGlite } = require('@electric-sql/pglite');
const root = path.resolve(__dirname, '../..');
function load(file) {
  const output = {};
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  new Function('exports', 'require', js)(output, name => name === 'server-only' ? {} : require(name));
  return output;
}
const crypto = load('lib/account-detail-crypto.ts');
const display = load('lib/sensitive-customer-fields.ts');
process.env.GAME_ACCOUNT_DETAILS_KEY = 'test-only-key-'.repeat(5);
const plaintext = '  Test password 🔑 with spaces  ';
const encrypted = crypto.encryptAccountDetail(plaintext, 'owner:product:field');
assert.equal(crypto.decryptAccountDetail(encrypted, 'owner:product:field'), plaintext);
assert(!encrypted.includes('Test password'));
assert.notEqual(encrypted, crypto.encryptAccountDetail(plaintext, 'owner:product:field'));
assert.throws(() => crypto.decryptAccountDetail(encrypted, 'different-owner'));
const parts = encrypted.split('.'); parts[3] = (parts[3][0] === 'A' ? 'B' : 'A') + parts[3].slice(1);
assert.throws(() => crypto.decryptAccountDetail(parts.join('.'), 'owner:product:field'));
assert.equal(display.customerDetailDisplay({ label: 'Login Password', value: 'secret' }), display.PROTECTED_DETAIL);
assert.equal(display.customerDetailDisplay({ label: 'Login Email', value: 'person@example.invalid' }), 'person@example.invalid');

(async () => {
  const db = new PGlite();
  await db.exec(`
    create schema auth;
    create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql as $$ select null::uuid $$;
    create role anon;create role authenticated;create role service_role;
    create table admin_users(user_id uuid primary key);
    create table categories(id uuid primary key,slug text);
    create table products(id uuid primary key,category_id uuid references categories(id));
    create table orders(id uuid primary key,status text);
    create table order_items(id uuid primary key default gen_random_uuid(),order_id uuid references orders(id),product_id uuid references products(id),quantity int,customer_information jsonb default '[]');
    create table product_customer_fields(id uuid primary key default gen_random_uuid(),product_id uuid references products(id),label text,placeholder text,field_type text,is_required boolean,sort_order int,created_at timestamptz default now(),updated_at timestamptz default now());
  `);
  const buyer = randomUUID(), otherBuyer = randomUUID(), admin = randomUUID(), games = randomUUID(), cards = randomUUID(), game = randomUUID(), card = randomUUID(), secondGame = randomUUID();
  await db.query('insert into auth.users values($1,now()),($2,now());',[buyer,otherBuyer]);
  await db.query('insert into admin_users values($1)',[admin]);
  await db.query("insert into categories values($1,'games'),($2,'gift-cards')",[games,cards]);
  await db.query('insert into products values($1,$2),($3,$4)',[game,games,card,cards]);
  await db.query("insert into product_customer_fields(product_id,label,field_type,is_required,sort_order) values($1,'PlayStation account email','EMAIL',true,0),($1,'PSN Online ID','TEXT',true,1),($2,'Recipient','TEXT',false,0)",[game,card]);
  const migration=fs.readFileSync(path.join(root,'supabase/migrations/20261008_190000_protected_game_account_details.sql'),'utf8');
  await db.exec(migration);
  const one = async (sql,params=[]) => (await db.query(sql,params)).rows[0];
  const fields = async product => (await db.query('select * from product_customer_fields where product_id=$1 order by sort_order',[product])).rows;
  assert.equal((await fields(game)).length,2,'Installing the migration must not enable new fields before deployment');
  assert.equal((await one('select activate_game_account_fields() count')).count,1);
  const configured=await fields(game);
  assert.deepEqual(configured.map(f=>f.label),['Login Email','Login Password','2FA Security Code']);
  assert(configured.every(f=>f.is_required));
  assert.equal(configured[0].field_type,'EMAIL');
  assert.equal((await fields(card))[0].label,'Recipient');
  await db.query('insert into products values($1,$2)',[secondGame,games]);
  assert.equal((await fields(secondGame)).length,3,'Future Games products inherit the fields');
  // Old catalog presets cannot reintroduce the superseded fields or duplicate email.
  await db.query("insert into product_customer_fields(product_id,label,field_type) values($1,'PSN Online ID','TEXT'),($1,'PlayStation account email','EMAIL')",[game]);
  assert.equal((await fields(game)).length,3);
  await db.exec(migration);
  assert.deepEqual((await fields(game)).map(f=>f.id),configured.map(f=>f.id),'Migration retry preserves existing field IDs');
  const password = configured[1].id, recovery=configured[2].id;
  async function token(field,owner=buyer,product=game,expired=false) {
    const id=randomUUID();
    await db.query(`insert into protected_account_details(id,user_id,product_id,field_id,ciphertext,consent_at,expires_at) values($1,$2,$3,$4,'v1.test.tag.cipher',now(),now()+$5::interval)`,[id,owner,product,field,expired?'-1 hour':'24 hours']);
    return 'protected:'+id;
  }
  const pass=await token(password), code=await token(recovery);
  const info=(p=pass,c=code)=>JSON.stringify([{fieldId:password,label:'Login Password',value:p},{fieldId:recovery,label:'2FA Security Code',value:c}]);
  async function order(actor,information=info(),quantity=1) {
    return db.transaction(async tx => {
      const orderId=randomUUID(),itemId=randomUUID();
      await tx.query("select set_config('app.business_buyer',$1,true)",[actor||'']);
      await tx.query("insert into orders values($1,'PENDING_PAYMENT')",[orderId]);
      await tx.query('insert into order_items(id,order_id,product_id,quantity,customer_information) values($1,$2,$3,$4,$5)',[itemId,orderId,game,quantity,information]);
      return {orderId,itemId};
    });
  }
  await assert.rejects(()=>order(null),/Sign in/);
  await assert.rejects(()=>order(otherBuyer),/cannot be reused/);
  await assert.rejects(()=>order(buyer,info('plaintext-password')),/protected form/);
  await assert.rejects(()=>order(buyer,info('protected:'+randomUUID())),/expired|cannot be reused/);
  const crossProduct=await token(password,buyer,secondGame),expired=await token(password,buyer,game,true);
  await assert.rejects(()=>order(buyer,info(crossProduct)),/cannot be reused/);
  await assert.rejects(()=>order(buyer,info(expired)),/expired/);
  await assert.rejects(()=>order(buyer,info(),2),/separate account details/);
  assert.equal((await one('select count(*)::int count from orders')).count,0,'Rejected orders leave no partial order');
  const success=await order(buyer);
  const stored=(await one('select customer_information from order_items where id=$1',[success.itemId])).customer_information;
  assert(stored.every(f=>f.value===display.PROTECTED_DETAIL),'Receipts contain masked markers only');
  await assert.rejects(()=>order(buyer),/cannot be reused/);
  await assert.rejects(()=>db.query('select reveal_protected_account_detail($1,$2,$3)',[admin,success.itemId,password]),/not awaiting delivery/);
  await db.query("update orders set status='PAID' where id=$1",[success.orderId]);
  await assert.rejects(()=>db.query('select reveal_protected_account_detail($1,$2,$3)',[otherBuyer,success.itemId,password]),/Administrator/);
  const revealed=await one('select reveal_protected_account_detail($1,$2,$3) detail',[admin,success.itemId,password]);
  assert.equal(revealed.detail.id,pass.slice(10));
  assert.equal((await one('select count(*)::int count from protected_account_access_log')).count,1);
  await db.query("update orders set status='DELIVERED' where id=$1",[success.orderId]);
  assert.equal((await one('select count(*)::int count from protected_account_details where order_id=$1',[success.orderId])).count,0);
  await db.exec('select purge_expired_account_details()');
  assert.equal((await one('select count(*)::int count from protected_account_details where expires_at<=now()')).count,0);
  for(const role of ['anon','authenticated']) {
    await db.exec('set role '+role);
    await assert.rejects(()=>db.query('select * from protected_account_details'),/permission denied/);
    await assert.rejects(()=>db.query('select activate_game_account_fields()'),/permission denied/);
    await assert.rejects(()=>db.query('select reveal_protected_account_detail($1,$2,$3)',[admin,success.itemId,password]),/permission denied/);
    await db.exec('reset role');
  }
  await db.close();
  console.log('PASS: encryption, tamper protection, category scope, inactive rollout, field preservation, ownership, single-use tokens, masked orders, paid-only admin access, cleanup, and database permissions.');
})().catch(error=>{console.error(error.message);process.exitCode=1;});
