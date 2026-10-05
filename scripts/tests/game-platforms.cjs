const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const { PGlite } = require('@electric-sql/pglite');
function load(file, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, require: (name) => mocks[name] ?? require(name), Date, Set });
  return exports;
}
const platforms = load('lib/game-platforms.ts');
function fixture({ admin = true, signedIn = true, category = { name: 'Games', slug: 'games', category_type: 'GAME_KEY' } } = {}) {
  const writes = [];
  const db = { auth: { getUser: async () => ({ data: { user: signedIn ? { id: 'user' } : null } }) }, from(table) {
    const q = {};
    for (const method of ['select', 'eq', 'not']) q[method] = () => q;
    q.update = (value) => { writes.push({ table, value }); return q; };
    const result = () => ({ data: table === 'admin_users' ? (admin ? { user_id: 'user' } : null) : table === 'categories' ? category : table === 'product_options' ? [] : null, error: null });
    q.maybeSingle = async () => result();
    q.then = (resolve, reject) => Promise.resolve(result()).then(resolve, reject);
    return q;
  }};
  const action = load('app/admin/products/[id]/edit/general/actions.ts', {
    '@/lib/game-platforms': platforms,
    'next/cache': { revalidatePath() {} },
    'next/navigation': { redirect(url) { throw new Error(url); } },
    '@/lib/supabase/admin-session': { createClient: async () => db },
    '@/lib/supabase/admin': { createAdminClient: () => db },
    '@/lib/digiseller-api': { updateDigiSellerProductName() { throw new Error('Unexpected external sync'); } },
    '@/lib/store-image-upload': { uploadStoreImage: async () => null },
  });
  return { writes, async save(selected) {
    const data = new FormData();
    Object.entries({ id: 'product', name: 'Game', category_id: 'category', region: 'Global' }).forEach(([k,v]) => data.set(k,v));
    selected.forEach((value) => data.append('gaming_platforms', value));
    try { await action.updateProductGeneral(data); } catch (error) { return error.message; }
  }};
}
test('Games saves several platforms and removes duplicates; clearing all is supported', async () => {
  for (const selected of [['PS5', 'Steam', 'PS5'], []]) {
    const f = fixture(); assert.match(await f.save(selected), /success=/);
    assert.deepEqual(Array.from(f.writes[0].value.gaming_platforms), [...new Set(selected)]);
  }
});
test('changing to a non-Games category clears platform metadata', async () => {
  const f = fixture({ category: { name: 'Gift Cards', slug: 'gift-cards', category_type: 'GIFT_CARD' } });
  assert.match(await f.save(['PS5']), /success=/);
  assert.deepEqual(Array.from(f.writes[0].value.gaming_platforms), []);
});
test('unknown platforms and oversized submissions cannot be saved', async () => {
  for (const selected of [['<script>'], ['ps5'], Array(100).fill('PS5')]) {
    const f = fixture(); assert.match(await f.save(selected), /Select%20valid%20gaming/); assert.equal(f.writes.length, 0);
  }
});
test('platform saves require an authenticated admin and a valid category', async () => {
  for (const options of [{admin:false}, {signedIn:false}, {category:null}]) {
    const f = fixture(options); assert(!String(await f.save(['PS5'])).includes('success=')); assert.equal(f.writes.length, 0);
  }
});
test('migration preserves existing products, defaults new products to no platforms, and is repeatable', async () => {
  const db = new PGlite();
  try {
    await db.exec("CREATE TABLE public.products (id int PRIMARY KEY, name text); INSERT INTO products VALUES (1,'Existing');");
    const sql = fs.readFileSync('supabase/migrations/20261005_110000_product_gaming_platforms.sql', 'utf8');
    await db.exec(sql); await db.exec(sql);
    await db.exec("INSERT INTO products (id,name) VALUES (2,'Draft'); UPDATE products SET gaming_platforms=ARRAY['PS5','Steam'] WHERE id=1;");
    const result = await db.query('SELECT * FROM products ORDER BY id');
    assert.deepEqual(result.rows, [{id:1,name:'Existing',gaming_platforms:['PS5','Steam']},{id:2,name:'Draft',gaming_platforms:[]}]);
  } finally { await db.close(); }
});

test('product reads survive the pending migration without hiding unrelated errors', async () => {
  const { readWithGamingPlatforms } = load('lib/product-platform-query.ts');
  for (const code of ['42703', 'PGRST204']) {
    const fields=[];
    const result=await readWithGamingPlatforms(async selection=>{fields.push(selection);return selection.includes('gaming_platforms')?{data:null,error:{code,message:'Missing gaming_platforms column'}}:{data:{id:1},error:null};},'id, gaming_platforms, name');
    assert.equal(result.data.id,1);assert.equal(fields.length,2);assert(!fields[1].includes('gaming_platforms'));
  }
  let calls=0;const error={code:'42501',message:'Permission denied'};
  const result=await readWithGamingPlatforms(async()=>{calls++;return {data:null,error};},'id, gaming_platforms, name');
  assert.equal(result.error,error);assert.equal(calls,1);
});
