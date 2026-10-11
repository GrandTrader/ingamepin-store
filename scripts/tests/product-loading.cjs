const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file, mocks = {}, globals = {}) {
  const mod = { exports: {} };
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText;
  vm.runInNewContext(output, { module: mod, exports: mod.exports, URL, Map, Date, console,
    require(name) {
      if (name in mocks) return mocks[name];
      if (name === 'react/jsx-runtime' || name === 'react') return require(name);
      if (name.endsWith('.css')) return { __esModule: true, default: {} };
      if (name.startsWith('@/components/') || name === 'next/link' || name === './ProductPurchaseForm') {
        const component = () => null; component.displayName = name;
        return { __esModule: true, default: component };
      }
      throw Error('Missing mock ' + name);
    }, ...globals }, { filename: file });
  return mod.exports;
}
const navigation = { notFound() { throw Error('NOT_FOUND'); }, permanentRedirect(url) { throw Error('REDIRECT:' + url); } };
const baseProduct = { id: 'p', public_id: 123456789, name: 'Product', slug: 'product', sold_count: 12,
  categories: { slug: 'games', name: 'Games', public_id: 987654321 }, affiliate_enabled: true,
  affiliate_commission_percent: 5, stock_quantity: 3, minimum_custom_value: null, maximum_custom_value: null };
const rule = { optionId: 'o', percent: 30, endsAt: '2099-01-01T00:00:00.000Z' };
function productRun({ product = baseProduct, canonical = true, category = 'games', ref = '', discount = 17, bulkDenied = false } = {}) {
  const calls = []; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const deferred = (table, data) => { calls.push({ table }); return gate.then(() => data); };
  const client = { from(table) {
    const q = { table, filters: [] }, b = {};
    for (const method of ['select', 'eq', 'in', 'order', 'limit', 'returns', 'maybeSingle'])
      b[method] = (...args) => { q.filters.push([method, ...args]); return b; };
    b.then = (yes, no) => {
      calls.push(q);
      const data = table === 'products' ? product : table === 'affiliate_settings' ? { program_enabled: false }
        : table === 'product_options' ? [{ id: 'o', option_name: 'Edition', selling_price: '49.00', stock_quantity: 3, is_in_stock: true }]
        : [];
      return (table === 'products' ? Promise.resolve() : gate).then(() => ({ data, error: null })).then(yes, no);
    }; return b;
  } };
  const module = load('app/product/[slug]/page.tsx', {
    'next/cache': { unstable_cache: fn => fn },
    'next/navigation': navigation,
    '@/lib/supabase/server': { createClient: async () => client },
    '@/lib/supabase/admin': { createAdminClient: () => client },
    '@/lib/product-platform-query': { readWithGamingPlatforms: (query, fields) => query(fields) },
    '@/lib/business-portal-data': { portalCustomer: async () => { calls.push({ table: 'bulk-authorization' }); if (bulkDenied) throw Error('BULK_DENIED'); } },
    '@/lib/game-platforms': { isGamesCategory: () => false, normalizeGamePlatforms: () => [] },
    '@/lib/game-account-description': { gameAccountDescription: text => text },
    '@/lib/sensitive-customer-fields': { isSensitiveCustomerField: () => false },
    '@/lib/product-delivery': { hasInstantDelivery: () => false },
    '@/lib/product-stock': { isUnlimitedStock: stock => stock < 0 },
    '@/lib/product-url': { getProductUrl: () => '/canonical' },
    '@/lib/customer-discounts': { getSignedInCustomerDiscounts: () => deferred('discounts', new Map([['p', discount]])) },
    '@/lib/product-sales': { getPaidProductSalesForProduct: () => deferred('sales', 4) },
    '@/lib/product-range-data': { productRanges: () => deferred('ranges', { ready: true, ranges: [] }) },
    '@/lib/product-promotion-data': { productPromotions: () => deferred('promotions', { ready: true, rows: [{ product_id: 'p', rules: [rule] }] }) },
  });
  return { calls, release, result: module.renderProductPage({ publicId: '123456789', canonicalRequest: canonical,
    canonicalCategory: { slug: category, publicId: '987654321' }, searchParams: Promise.resolve({ ref }) }) };
}
function find(node, predicate) {
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const child of [node.props?.children].flat(Infinity)) { const found = find(child, predicate); if (found) return found; }
  return null;
}
test('One product lookup starts independent purchase queries together, without waiting for reviews', async () => {
  const run = productRun();
  await new Promise(resolve => setImmediate(resolve));
  for (const table of ['product_options', 'product_customer_fields', 'discounts', 'sales', 'ranges', 'promotions', 'affiliate_settings'])
    assert(run.calls.some(q => q.table === table), table + ' should start before any dependent request finishes');
  assert.equal(run.calls.filter(q => q.table === 'products').length, 1);
  const filters = run.calls[0].filters;
  for (const [key, value] of [['public_id', '123456789'], ['status', 'ACTIVE'], ['retail_enabled', true], ['is_preorder_only', false]])
    assert(filters.some(f => f[0] === 'eq' && f[1] === key && f[2] === value));
  assert(!run.calls.some(q => /review/.test(q.table)));
  run.release(); const tree = await run.result;
  const form = find(tree, el => el.type?.displayName === './ProductPurchaseForm');
  assert.equal(form.props.product.customerDiscountPercent, 17);
  assert.equal(form.props.options[0].sellingPrice, 49);
  assert.equal(form.props.options[0].stockQuantity, 3);
  assert.equal(form.props.product.promotionRules[0].endsAt, rule.endsAt);
  assert(find(tree, el => el.type === require('react').Suspense), 'Reviews have their own loading boundary');
});
test('Canonical corrections and legacy URLs preserve referrals before purchase data is loaded', async () => {
  for (const params of [{ canonical: false }, { category: 'renamed-category' }]) {
    const run = productRun({ ...params, ref: 'PROMO ABC' });
    await assert.rejects(run.result, /REDIRECT:\/canonical\?ref=PROMO%20ABC/);
    assert.deepEqual(run.calls.map(q => q.table), ['products']); run.release();
  }
});
test('Missing products and bulk access controls remain enforced', async () => {
  const missing = productRun({ product: null }); await assert.rejects(missing.result, /NOT_FOUND/);
  const noCategory = productRun({ product: { ...baseProduct, categories: null } }); await assert.rejects(noCategory.result, /NOT_FOUND/);
  const bulk = productRun({ product: { ...baseProduct, is_bulk_order: true }, bulkDenied: true });
  await assert.rejects(bulk.result, /BULK_DENIED/);
  assert.deepEqual(bulk.calls.map(q => q.table), ['products', 'bulk-authorization']);
});
test('Separate requests keep their own customer discount', async () => {
  const a = productRun({ discount: 10 }), b = productRun({ discount: 25 }); a.release(); b.release();
  const form = tree => find(tree, el => el.type?.displayName === './ProductPurchaseForm');
  assert.equal(form(await a.result).props.product.customerDiscountPercent, 10);
  assert.equal(form(await b.result).props.product.customerDiscountPercent, 25);
});
test('Canonical route validates IDs and directly renders the requested public ID', async () => {
  const calls = [];
  const route = load('app/category/[slug]/[categoryPublicId]/subcategory/[productPublicId]/page.tsx', {
    'next/cache': { unstable_cache: fn => fn },
    'next/navigation': navigation, '@/app/product/[slug]/page': { renderProductPage: args => { calls.push(args); return 'product'; } },
  }).default;
  const invoke = productPublicId => route({ params: Promise.resolve({ slug: 'games', categoryPublicId: '987654321', productPublicId }), searchParams: Promise.resolve({}) });
  await assert.rejects(invoke('invalid'), /NOT_FOUND/); assert.equal(calls.length, 0);
  assert.equal(await invoke('123456789'), 'product'); assert.equal(calls[0].publicId, '123456789');
});
test('Reviews stay bounded, product-scoped and masked; one failed source does not hide the product', async () => {
  for (const unavailable of [false, true]) {
    const calls = [];
    const admin = { from(table) {
      const q = { table, filters: [] }, b = {};
      for (const method of ['select', 'eq', 'order', 'limit']) b[method] = (...args) => { q.filters.push([method, ...args]); return b; };
      b.then = resolve => { calls.push(q); resolve(table === 'order_reviews'
        ? { error: unavailable ? { message: 'unavailable' } : null, data: [{ id: 1, customer_email: 'private@example.test', sentiment: 'POSITIVE', comment: 'Good', created_at: '2026-10-10' }] }
        : { error: null, data: [{ id: 2, sentiment: 'NEGATIVE', comment: 'Late', reviewed_at: '2026-10-09' }] }); };
      return b;
    } };
    const info = load('components/ProductInformation.tsx', {
      '@/lib/supabase/admin': { createAdminClient: () => admin }, './ProductDetailsTabs': { __esModule: true, default: () => null },
    }).default;
    const result = await info({ productId: 'p', description: 'Product details' });
    assert.equal(result.props.reviewsUnavailable, unavailable);
    assert.equal(result.props.reviews.length, unavailable ? 1 : 2);
    assert(!JSON.stringify(result.props).includes('private@example.test'));
    for (const query of calls) {
      assert(query.filters.some(f => f[0] === 'eq' && f[1] === 'is_visible' && f[2] === true));
      assert(query.filters.some(f => f[0] === 'eq' && f[1].endsWith('product_id') && f[2] === 'p'));
      assert(query.filters.some(f => f[0] === 'limit' && f[1] <= 100));
    }
  }
});
test('Image optimization is restricted to public artwork, leaving signed and unknown URLs untouched', () => {
  const image = load('lib/product-image.ts', {}, { process: { env: { NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co' } } });
  for (const url of ['/images/card.png', 'https://example.supabase.co/storage/v1/object/public/store-images/product.jpg', 'https://image.api.playstation.com/vulcan/game.png', 'https://res.cloudinary.com/as4zd5aj/image/upload/card.webp']) assert(image.canOptimizeProductImage(url), url);
  for (const url of ['https://other.supabase.co/storage/v1/object/public/store-images/product.jpg', 'https://example.supabase.co/storage/v1/object/sign/private/a.jpg?token=secret', 'https://image.api.playstation.com/other/a.jpg', 'https://localhost/a.png', 'https://evil.test/a.jpg', '/api/private-image', '/images/../api/private-image', '/images/card.svg', '/images/card.gif', 'https://user:pass@image.api.playstation.com/vulcan/a.png']) assert(!image.canOptimizeProductImage(url), url);
});

test('Large catalogue price batches run concurrently with bounded requests and keep every offer', async () => {
  const calls = []; let release;
  const gate = new Promise(resolve => { release = resolve; });
  const promos = Array.from({ length: 250 }, (_, i) => ({ product_id: String(i), rules: [{ optionId: null, percent: 20, endsAt: '2099-01-01T00:00:00Z' }] }));
  const db = { from(table) {
    let ids = []; const q = {};
    for (const method of ['select', 'eq', 'order', 'range']) q[method] = () => q;
    q.in = (_, values) => { ids = values; return q; };
    q.then = (resolve, reject) => {
      if (table === 'product_promotions') return Promise.resolve({ data: promos.filter(p => ids.includes(p.product_id)), error: null }).then(resolve, reject);
      calls.push({ table, ids });
      return gate.then(() => ({ data: ids.map(id => ({ id: 'o' + id, product_id: id, selling_price: 50, is_custom_value: false })), error: null })).then(resolve, reject);
    }; return q;
  } };
  const data = load('lib/product-promotion-data.ts', {
    'server-only': {}, 'next/cache': { unstable_cache: fn => fn }, '@/lib/supabase/admin': { createAdminClient: () => db },
    './product-promotions': load('lib/product-promotions.ts'), './product-range': load('lib/product-range.ts'),
    './product-range-data': { productRanges(ids) { calls.push({ table: 'ranges', ids }); return gate.then(() => ({ ranges: [] })); } },
  });
  const result = data.cataloguePromotions(promos.map(p => p.product_id));
  await new Promise(resolve => setImmediate(resolve));
  try {
    assert.equal(calls.filter(c => c.table === 'ranges').length, 2, 'Only two batches should start at once');
    assert.equal(calls.filter(c => c.table === 'product_options').length, 2, 'Options must not wait for range queries');
  } finally { release(); }
  const offers = await result;
  assert.equal(offers.size, 250);
  for (const entries of offers.values()) {
    assert.equal(entries[0].price, 50); assert.equal(entries[0].percent, 20);
    assert.equal(entries[0].endsAt, '2099-01-01T00:00:00Z');
  }
});

test('Homepage renders immediately; discovery, catalogue and private prices load independently', async () => {
  let releasePersonal, releasePresentation, releaseProducts;
  const personal = new Promise(resolve => { releasePersonal = resolve; });
  const presentation = new Promise(resolve => { releasePresentation = resolve; });
  const products = new Promise(resolve => { releaseProducts = resolve; });
  const data = { categories: [{ id: 'c', public_id: 987654321, name: 'Games', slug: 'games' }],
    preorderPopup: null, sliderSettings: { is_enabled: true, autoplay_ms: 5000 },
    slides: [{ id: 's', title: 'Featured game', desktop_image_url: '/images/banner.webp', button_url: '/product/product' }] };
  const rows = [{ ...baseProduct, price: 50, product_type: 'GIFT_CARD', product_options: [], created_at: '2026-10-01' }];
  let privateStarted = false;
  const home = load('app/page.tsx', {
    '@/lib/product-delivery': { hasInstantDelivery: () => false },
    '@/lib/product-promotion-data': { cataloguePromotions: async () => new Map() },
    '@/lib/customer-discounts': { getSignedInCustomerDiscounts: () => { privateStarted=true; return personal; } },
    '@/lib/homepage-data': { getHomepageData: () => presentation },
    '@/lib/store-catalogue': { getStoreProducts: () => products },
    '@/lib/product-sales': { getPaidProductSales: async () => new Map() },
    '@/lib/product-url': { getProductUrl: () => '/canonical' },
  }).default;
  try {
    const tree = home();
    assert(!tree.then, 'Initial homepage must not suspend behind public or customer database reads');
    assert(privateStarted, 'Independent customer lookup starts before catalogue returns');
    const mobile = find(tree, el => el.type?.displayName === '@/components/MobileStorefront');
    assert(mobile);
    let productsReady = false;
    mobile.props.catalogue.then(() => { productsReady=true; });
    releasePresentation(data);
    const discovery = await mobile.props.discovery;
    assert.equal(discovery.categories.length, 1);
    assert.equal(discovery.heroSlides[0].title, 'Featured game');
    assert.equal(productsReady, false, 'Banner and categories do not wait for catalogue');
    releaseProducts(rows);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(productsReady, false, 'Do not flash undiscounted prices while private prices are pending');
    releasePersonal(new Map([['p',15]]));
    const ready = await mobile.props.catalogue;
    assert.equal(ready.products[0].discountPercent,15);
    assert.equal(ready.products[0].price,50);
    assert.deepEqual(Array.from(ready.popularIds),['p']);
  } finally { releasePresentation(data); releaseProducts(rows); releasePersonal(new Map()); }
});

test('Repeated catalogue visits reuse public prices, expiry still applies, and invalidation refreshes edits', async () => {
  const cached = new Map(), reads = []; let settings, price = 50;
  const expiry = new Date(Date.now() + 10000).toISOString();
  const db = { from(table) {
    const q = {};
    for (const method of ['select', 'eq', 'order', 'range', 'in']) q[method] = () => q;
    q.then = resolve => {
      reads.push(table);
      resolve({ data: table === 'product_promotions' ? [{ product_id: 'p', rules: [{ optionId: null, percent: 20, endsAt: expiry }] }]
        : [{ id: 'o', product_id: 'p', selling_price: price, is_custom_value: false }], error: null });
    }; return q;
  } };
  const prices = load('lib/product-promotions.ts');
  const data = load('lib/product-promotion-data.ts', {
    'server-only': {}, '@/lib/supabase/admin': { createAdminClient: () => db },
    './product-promotions': prices, './product-range': load('lib/product-range.ts'),
    './product-range-data': { productRanges: async () => ({ ranges: [] }) },
    'next/cache': { unstable_cache(fn, key, options) {
      settings = options;
      return async (...args) => { const id = JSON.stringify(args); if (!cached.has(id)) cached.set(id, await fn(...args)); return cached.get(id); };
    } },
  });
  const first = await data.cataloguePromotions(['p']);
  assert.equal(prices.cardPromotionPrice(first.get('p'), 50, 0).price, 40);
  const readsBefore = reads.length;
  const again = await data.cataloguePromotions(['p', 'p']);
  assert.equal(reads.length, readsBefore);
  assert.equal(prices.cardPromotionPrice(again.get('p'), 50, 0, Date.parse(expiry) + 1).price, 50, 'Cached offer stops at its actual expiry');
  assert.equal(prices.cardPromotionPrice(again.get('p'), 50, 30).price, 35, 'Personal discount stays separate from the public cache');
  assert.equal(settings.revalidate, 30);
  assert(Array.from(settings.tags).includes('homepage-store-data'));
  price = 60; cached.clear();
  assert.equal((await data.cataloguePromotions(['p'])).get('p')[0].price, 60);
  assert(reads.every(table => ['product_promotions', 'product_options'].includes(table)));
});
