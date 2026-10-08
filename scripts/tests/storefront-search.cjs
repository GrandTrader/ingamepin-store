const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

function load(file, mocks = {}) {
  const module = { exports: {} };
  const js = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: {
    module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX,
  }}).outputText;
  new Function('module', 'exports', 'require', js)(module, module.exports,
    name => name in mocks ? mocks[name] : require(name));
  return module.exports;
}
const search = load('lib/storefront-search.ts');
const paging = load('lib/product-search-pages.ts');
const productUrl = load('lib/product-url.ts');
const productDelivery = load('lib/product-delivery.ts');
const common = {
  '@/lib/storefront-search': search,
  '@/lib/product-search-pages': paging,
  '@/lib/product-url': productUrl,
  '@/lib/product-delivery': productDelivery,
};
function product(id, name, extra = {}) {
  return {
    id, name, name_ru: null, slug: id, public_id: id,
    price: '12.50', stock_quantity: 10, sold_count: 3, rating: 5,
    status: 'ACTIVE', retail_enabled: true, is_preorder_only: false,
    product_type: 'GIFT_CARD', delivery_type: 'MANUAL', region: 'India',
    categories: { name: 'Gift Cards', short_name: 'Gift Cards', slug: 'gift-cards', public_id: 20 },
    product_options: [], ...extra,
  };
}
const catalogue = [
  product('steam', 'Steam  Wallet Code India'),
  product('apple', 'Apple App Store & iTunes USA', { region: 'USA' }),
  product('hunter', 'Monster Hunter: World', {
    name_ru: 'Охотник на монстров', public_id: 874868522, product_type: 'GAME_KEY',
    categories: { name: 'Games', short_name: null, slug: 'games', public_id: 30 },
    product_options: [
      { option_name: 'Deluxe Edition', platform: 'PS4', is_active: true, is_in_stock: true, stock_quantity: 1 },
      { option_name: 'Hidden Test Edition', platform: 'PS5', is_active: false },
    ],
  }),
  product('draft', 'Steam Draft', { status: 'DRAFT' }),
  product('business', 'Steam Business Only', { retail_enabled: false }),
  product('preorder', 'Steam Preorder', { is_preorder_only: true }),
];
function fixture(rows = catalogue, failAt = -1) {
  const queries = [];
  const client = { from(table) {
    assert.equal(table, 'products');
    const q = { filters: [], order: [] }; queries.push(q);
    const builder = {
      select(columns) { q.columns = columns; return builder; },
      eq(column, value) { q.filters.push([column, value]); return builder; },
      order(column) { q.order.push(column); return builder; },
      range(from, to) {
        q.range = [from, to];
        return Promise.resolve(from === failAt
          ? { data: null, error: { message: 'Private database error' } }
          : { data: rows.filter(row => q.filters.every(([key, value]) => row[key] === value)).slice(from, to + 1), error: null });
      },
    };
    return builder;
  }};
  const mocks = { ...common, '@/lib/supabase/server': { createClient: async () => client } };
  const route = load('app/api/products/search/route.ts', mocks);
  const page = load('app/products/[[...collection]]/page.tsx', {
    ...mocks,
    'next/link': { __esModule: true, default: 'a' },
    'next/navigation': { notFound() { throw Error('NOT_FOUND'); }, redirect(url) { throw Error('REDIRECT:' + url); } },
    '@/components/ProductCard': { __esModule: true, default: ({ product: p }) => React.createElement('article', { 'data-product-id': p.id }, p.name) },
    '@/lib/customer-discounts': { getSignedInCustomerDiscounts: async () => new Map([['steam', 5]]) },
    '@/lib/product-sales': { getPaidProductSales: async () => new Map([['steam', 7]]) },
    '@/lib/business-portal-data': { portalCustomer: async () => { throw Error('BUSINESS_AUTH_REQUIRED'); } },
  });
  return {
    queries,
    api: q => route.GET({ nextUrl: new URL('https://store.example/api/products/search?q=' + encodeURIComponent(q)) }),
    page: (q, collection) => page.default({ params: Promise.resolve({ collection }), searchParams: Promise.resolve({ search: q }) }),
  };
}
function cards(node, found = []) {
  if (Array.isArray(node)) node.forEach(child => cards(child, found));
  else if (React.isValidElement(node)) {
    if (node.props.product) found.push(node.props.product);
    cards(node.props.children, found);
  }
  return found;
}
function publicOnly(queries) {
  for (const q of queries) {
    assert.deepEqual(q.filters, [['status', 'ACTIVE'], ['retail_enabled', true], ['is_preorder_only', false]]);
    assert.equal(q.order.at(-1), 'id', 'Page boundaries must have a stable tie-breaker');
  }
}

test('search accepts reordered words, extra spaces, punctuation, accents and Russian names', () => {
  const match = search.matchesStorefrontSearch;
  assert(match(['Steam  Wallet Code India'], ' wallet   STEAM '));
  assert(match(['Assassin’s Creed: Édition'], 'assassins edition creed'));
  assert(match(['Охотник на монстров'], 'монстров ОХОТНИК'));
  assert(!match(['Steam Wallet Code India'], 'steam apple'));
  assert(!match(['Any product'], '%_'));
  assert(match(['Any product'], '  '));
  assert.equal(search.storefrontSearchQuery([' Steam\n wallet ', 'ignored']), 'Steam wallet');
  assert.equal(search.storefrontSearchQuery('x'.repeat(200)).length, 100);
  assert.equal(search.storefrontSearchQuery({}), '');
});

test('search finds public product IDs, categories, regions and active edition platforms', () => {
  const p = catalogue[2];
  for (const term of ['874868522', 'games india', 'deluxe ps4', 'world hunter', 'монстров']) {
    assert(search.matchesStorefrontProduct(p, term), term);
    assert(search.matchesStorefrontProduct({ ...p, categories: [p.categories] }, term), term);
  }
  assert(!search.matchesStorefrontProduct(p, 'Hidden Test'));
  assert(!search.matchesStorefrontProduct(p, 'PS5'));
});

test('submitted website search filters the page and preserves card prices, discounts and sales', async () => {
  const run = fixture();
  const result = await run.page('wallet steam');
  const products = cards(result);
  assert.deepEqual(products.map(p => p.id), ['steam']);
  assert.equal(products[0].price, 12.5);
  assert.equal(products[0].discountPercent, 5);
  assert.equal(products[0].sold, 10);
  const html = renderToStaticMarkup(result);
  assert.match(html, /Search results/);
  assert.match(html, /wallet steam/);
  assert.match(html, /Clear search/);
  assert(!html.includes('Apple App Store'));
  publicOnly(run.queries);
});

test('unknown and wildcard-only searches show no results instead of the whole catalogue', async () => {
  const run = fixture();
  for (const q of ['zzzz-no-such-product-49381', '%_', '<script>alert(1)</script>']) {
    const result = await run.page(q);
    assert.equal(cards(result).length, 0);
    const html = renderToStaticMarkup(result);
    assert.match(html, /No products found/);
    assert(!html.includes('<script>'));
  }
});

test('blank searches keep browsing and collection filters still intersect the query', async () => {
  const run = fixture();
  assert.equal(cards(await run.page(undefined)).length, 3);
  assert.equal(cards(await run.page('   ')).length, 3);
  assert.deepEqual(cards(await run.page(['Steam', 'Apple'])).map(p => p.id), ['steam']);
  assert.equal(cards(await run.page('Apple', ['steam'])).length, 0);
  const result = await run.page('hunter', ['game-keys']);
  assert.deepEqual(cards(result).map(p => p.id), ['hunter']);
  assert.match(renderToStaticMarkup(result), /href="\/products\/game-keys"/);
  await assert.rejects(run.page('Steam', ['bulk']), /BUSINESS_AUTH_REQUIRED/);
  await assert.rejects(run.page('Steam', ['unknown']), /NOT_FOUND/);
});

test('suggestions and submitted results match for multilingual and multiword searches', async () => {
  const run = fixture();
  for (const q of ['wallet steam', 'монстров', 'deluxe ps4', 'games india', 'zzzz']) {
    const response = await run.api(q);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const payload = await response.json();
    assert.deepEqual(payload.products.map(p => p.id), cards(await run.page(q)).map(p => p.id));
    for (const p of payload.products) assert(!('product_options' in p), 'Only the public suggestion DTO is returned');
  }
  publicOnly(run.queries);
});

test('suggestion limit is applied after matching and short queries do not read the database', async () => {
  const run = fixture(Array.from({ length: 520 }, (_, i) => product(String(i), i >= 501 ? 'Steam Wallet ' + i : 'Other ' + i)));
  assert.deepEqual(await (await run.api('s')).json(), { products: [] });
  assert.equal(run.queries.length, 0);
  const response = await (await run.api('steam')).json();
  assert.deepEqual(response.products.map(p => p.id), ['501', '502', '503', '504', '505', '506']);
  assert.deepEqual(run.queries.map(q => q.range), [[0, 499], [500, 999]]);
  const result = await run.page('steam');
  assert.equal(cards(result).length, 19, 'Products after the first page remain searchable');
});

test('database failures never masquerade as a partial or empty successful catalogue', async () => {
  const run = fixture(Array.from({ length: 502 }, (_, i) => product(String(i), 'Steam ' + i)), 500);
  const response = await run.api('Steam');
  assert.equal(response.status, 500);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { error: 'Unable to search products.' });
  await assert.rejects(run.page('Steam'), /Unable to load products/);
});
