const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const assert = require('node:assert/strict'), ts = require('typescript');
const out = path.resolve('tmp/store-rate-refresh');
const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true } }).outputText;

(async () => {
  let settings = { data: { store_usd_rub_rate: 88.2, store_usd_inr_rate: 102 }, error: null };
  const route = {};
  new Function('require', 'exports', compile('app/api/store-settings/route.ts'))(name => {
    if (name === '@/lib/supabase/admin') return { createAdminClient: () => ({ from: () => ({ select() { return this; }, eq() { return this; }, maybeSingle: async () => settings }) }) };
    return require(name);
  }, route);
  const before = await route.GET();
  assert.equal((await before.json()).usdRubRate, 88.2);
  for (const key of ['Cache-Control', 'CDN-Cache-Control', 'Vercel-CDN-Cache-Control']) assert.match(before.headers.get(key), /no-store/);
  settings.data = { store_usd_rub_rate: 86.8, store_usd_inr_rate: 100.5 };
  assert.deepEqual(await (await route.GET()).json(), { usdRubRate: 86.8, usdInrRate: 100.5 });
  settings.error = { message: 'Database unavailable' };
  assert.equal((await route.GET()).status, 503);

  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'Provider.js'), compile('components/StorePreferences.tsx'));
  fs.writeFileSync(path.join(out, 'entry.js'), `const React=require('react'), prefs=require('./Provider');function View(){const p=prefs.useStorePreferences();return React.createElement('div',null,React.createElement('output',null,p.usdRubRate+','+p.usdInrRate),React.createElement('button',{onClick:()=>p.setCurrency('INR')},'INR'));}require('react-dom/client').createRoot(document.getElementById('app')).render(React.createElement(prefs.StorePreferencesProvider,null,React.createElement(View)));`);
  const webpack = require('next/dist/compiled/webpack/webpack').webpack;
  await new Promise((resolve, reject) => webpack({ mode: 'development', devtool: false, entry: path.join(out, 'entry.js'), output: { path: out, filename: 'bundle.js' } }, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString({all:false,errors:true}))) : resolve()));
  let rates = { usdRubRate: 88.2, usdInrRate: 102 }, fail = false, requests = 0;
  const server = http.createServer((req, res) => {
    if (req.url === '/api/store-settings') { requests++; res.setHeader('Content-Type', 'application/json'); res.statusCode = fail ? 503 : 200; res.end(JSON.stringify(rates)); }
    else if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(fs.readFileSync(path.join(out, 'bundle.js'))); }
    else { res.setHeader('Content-Type', 'text/html'); res.end('<html><div id="app"></div><script src="/bundle.js"></script></html>'); }
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const { chromium } = require('C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const browser = await chromium.launch({ headless: true, executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe' });
  try {
    const page = await browser.newPage();
    await page.clock.install();
    await page.addInitScript(() => {
      localStorage.setItem('storePreferencesManual', 'true'); localStorage.setItem('storeCurrency', 'RUB'); localStorage.setItem('storeLanguage', 'en');
      window.rateFetches = []; const original = window.fetch;
      window.fetch = (url, opts) => { if (url === '/api/store-settings') window.rateFetches.push(opts.cache); return original(url, opts); };
    });
    await page.goto('http://127.0.0.1:' + server.address().port);
    await page.waitForFunction(() => document.querySelector('output')?.textContent === '88.2,102');
    rates = { usdRubRate: 86.8, usdInrRate: 100.5 };
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.waitForFunction(() => document.querySelector('output').textContent === '86.8,100.5');
    rates = { usdRubRate: 87, usdInrRate: 101 };
    await page.clock.fastForward(30_000);
    await page.waitForFunction(() => document.querySelector('output').textContent === '87,101');
    rates = { usdRubRate: 86, usdInrRate: 100 };
    await page.getByRole('button', { name: 'INR', exact: true }).click();
    await page.waitForFunction(() => document.querySelector('output').textContent === '86,100');
    fail = true;
    const previousRequests = requests;
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.waitForResponse(r => r.url().includes('/api/store-settings') && r.status() === 503);
    assert(requests > previousRequests);
    assert.equal(await page.locator('output').textContent(), '86,100');
    assert((await page.evaluate(() => window.rateFetches)).every(cache => cache === 'no-store'));
    console.log('PASS: uncached current rates; refresh on focus, timer, currency change and visibility; last rates retained on API failure.');
  } finally { await browser.close(); server.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
