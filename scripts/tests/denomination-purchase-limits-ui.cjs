const fs = require('node:fs'), path = require('node:path'), http = require('node:http'), assert = require('node:assert/strict'), ts = require('typescript');
const out = path.resolve('tmp/denomination-limits-ui'); fs.mkdirSync(out, { recursive: true });
const files = ['app/account/portal/new/ProductTable.tsx', 'lib/business-portal.ts', 'lib/business-catalogue-rows.ts', 'lib/product-range.ts', 'lib/face-value.ts', 'lib/product-promotions.ts', 'components/usePromotionClock.ts'];
const aliases = {};
for (const file of files) {
  const destination = path.join(out, path.basename(file).replace(/\.tsx?$/, '.js'));
  fs.writeFileSync(destination, ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText);
  aliases['@/' + file.replace(/\.tsx?$/, '')] = destination;
}
const css = fs.readFileSync('app/account/portal/Portal.module.css', 'utf8');
const classes = Object.fromEntries([...css.matchAll(/\.([A-Za-z][A-Za-z0-9]*)/g)].map(m => [m[1], m[1]]));
fs.writeFileSync(path.join(out, 'styles.js'), 'module.exports=' + JSON.stringify(classes));
fs.writeFileSync(path.join(out, 'empty.js'), 'module.exports=()=>null;');
aliases['../Portal.module.css'] = path.join(out, 'styles.js');
for (const name of ['next/image', '@/components/CountryFlag', './PortalCheckout']) aliases[name] = path.join(out, 'empty.js');
const option = (id, amount, custom = false) => ({ id, option_name: `${amount} INR`, denomination: amount, denomination_currency: 'INR', selling_price: amount / 100, is_active: true, is_in_stock: true, is_custom_value: custom });
const product = { id: 'product', name: 'Test gift card', slug: 'test', region: 'India', currency: 'USD', product_type: 'GIFT_CARD', delivery_type: 'MANUAL', minimum_quantity: 1, maximum_quantity: 10, is_bulk_order: false, product_customer_fields: [], product_options: [option('one', 1000), option('two', 2000), option('range', 1, true)] };
const range = { product_id: 'product', option_id: 'range', enabled: true, currency: 'INR', minimum: 100, maximum: 5000, step: 1, price_basis: 100, price_usd: 1, delivery_mode: 'MANUAL' };
fs.writeFileSync(path.join(out, 'entry.js'), `const React=require('react');require('react-dom/client').createRoot(document.getElementById('app')).render(React.createElement(require('./ProductTable').default,{userId:'test-buyer',products:${JSON.stringify([product])},ranges:${JSON.stringify([range])},discounts:{},filters:null}));`);
fs.writeFileSync(path.join(out, 'index.html'), '<!doctype html><html><head><meta charset="utf-8"><style>body{font-family:Arial;margin:24px}' + css + '</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>');
(async () => {
  const webpack = require('next/dist/compiled/webpack/webpack').webpack;
  await new Promise((resolve, reject) => webpack({ mode: 'development', devtool: false, entry: path.join(out, 'entry.js'), output: { path: out, filename: 'bundle.js' }, resolve: { alias: aliases } }, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  const server = http.createServer((req, res) => { const file = req.url === '/bundle.js' ? 'bundle.js' : 'index.html'; res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(fs.readFileSync(path.join(out, file))); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { chromium } = require('C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage(), errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.route('**/api/products/quantity-limits', route => route.fulfill({ json: { limits: ['one', 'two', 'range'].map(id => ({ productOptionId: id, minimumQuantity: 1, maximumQuantity: 1, availableQuantity: null, denominationCurrency: 'INR', onePerDenomination: true })) } }));
    await page.goto('http://127.0.0.1:' + server.address().port);
    const row = id => page.locator(`[data-option-id="${id}"]`);
    await row('one').getByRole('button', { name: 'Add', exact: true }).click();
    await row('two').getByRole('button', { name: 'Add', exact: true }).click();
    await row('one').getByLabel('Quantity for Test gift card 1000 INR', { exact: true }).fill('1');
    await row('one').getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Only one of each' }).waitFor();
    for (const value of ['3000', '4000']) {
      await row('range').getByLabel('Card value for Test gift card').fill(value);
      await row('range').getByLabel('Quantity for Test gift card 1 INR', { exact: true }).fill('1');
      await row('range').getByRole('button', { name: 'Add', exact: true }).click();
    }
    const draft = await page.evaluate(() => JSON.parse(localStorage.getItem('business-order-draft:test-buyer')));
    assert.equal(draft.length, 4, 'Different fixed and custom denominations can share a draft');
    assert(draft.every(item => item.quantity === 1));
    await row('range').getByLabel('Card value for Test gift card').fill('3000');
    await row('range').getByLabel('Quantity for Test gift card 1 INR', { exact: true }).fill('1');
    await row('range').getByRole('button', { name: 'Add', exact: true }).click();
    await page.getByRole('alert').filter({ hasText: 'Only one of each' }).waitFor();
    assert.equal((await page.evaluate(() => JSON.parse(localStorage.getItem('business-order-draft:test-buyer')))).length, 4);
    assert.deepEqual(errors, []);
    console.log('PASS browser: distinct denominations added together, repeat fixed/custom values blocked, quantities stay at one.');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
