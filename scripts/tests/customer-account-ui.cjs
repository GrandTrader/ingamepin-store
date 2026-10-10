// Render the real account components with sample orders; never connect to customer data.
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const assert = require('node:assert/strict');
const ts = require('typescript');
const out = path.join(process.cwd(), 'tmp/customer-account-ui');
const write = (file, content) => {
  const target = path.join(out, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
};
const sources = [
  'app/account/dashboard/DashboardView.tsx', 'app/account/CustomerAccountShell.tsx',
  'app/account/CustomerAccountNav.tsx', 'app/account/AccountIcon.tsx',
  'components/NavigationLink.tsx', 'components/InstallCustomerAppButton.tsx',
  'lib/portal-navigation.ts',
];
for (const file of sources) {
  write(file.replace(/\.tsx?$/, '.js'), ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
  }).outputText);
}
let css = '';
for (const file of ['app/account/Account.module.css', 'app/account/dashboard/Dashboard.module.css', 'components/NavigationLink.module.css']) {
  const raw = fs.readFileSync(file, 'utf8');
  const prefix = 'test_' + path.basename(file).split('.')[0] + '_';
  const classes = Object.fromEntries([...raw.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => [m[1], prefix + m[1]]));
  write(file, 'module.exports={__esModule:true,default:' + JSON.stringify(classes) + '};');
  css += raw.replace(/\.([a-zA-Z][\w-]*)/g, (_, name) => '.' + classes[name]) + '\n';
}
write('link.js', "module.exports=({children,...props})=>require('react').createElement('a',props,children);module.exports.useLinkStatus=()=>({pending:false});");
write('navigation.js', 'exports.usePathname=()=>location.pathname;');
write('app/account/actions.js', 'exports.customerLogout=async()=>{window.signedOut=true};');
write('app/account/CustomerPasskeyReminder.js', 'module.exports=()=>null;');
write('entry.js', [
  "const React=require('react'),{createRoot}=require('react-dom/client'),View=require('./app/account/dashboard/DashboardView').default;",
  "const params=new URLSearchParams(location.search),edge=params.has('edge'),empty=params.has('empty');",
  "const tabs=[{value:'all',label:'All'},{value:'completed',label:'Completed'},{value:'processing',label:'Processing'},{value:'pending',label:'Pending'}];",
  "const active=tabs.find(t=>t.value===params.get('status'))||tabs[0],page=Number(params.get('page')||1);",
  "const counts=empty?{all:0,completed:0,processing:0,pending:0}:{all:41,completed:12,processing:1,pending:28};",
  "const titles=['Apple iTunes Store Code India','007 First Light — PS5 India','EA FC Mobile Points','Steam Wallet Gift Card','Resident Evil Requiem — Deluxe Edition'];",
  "const statuses=['PENDING_PAYMENT','DELIVERED','PAID','PAYMENT_REVIEW','REFUNDED'];",
  "const orders=empty?[]:titles.map((title,i)=>({id:'order-'+i,order_number:'IP2026100816495'+i,total:edge?123456.78:[10.98,48.49,0.41,25,36.43][i],currency:'USD',status:statuses[i],created_at:'2026-10-08T06:12:00Z',delivered_at:null,order_items:[{id:'item-'+i,product_name:edge?title+' — A very long digital game product name with the complete edition and bonus content':title,option_name:i===0?'INR 100':i===1?'Standard Edition — PS5':'Digital delivery',denomination:100,platform:null,quantity:i===0?10:1},...(edge&&i===0?[{id:'extra',product_name:'Second product in the same order',option_name:'Deluxe Edition',quantity:2}]:[])]}));",
  "createRoot(document.getElementById('app')).render(React.createElement(View,{displayName:edge?'VeryLongCustomerNameWithoutSpacesToCheckResponsiveWrapping':'arithg345',wallet:{balance:edge?12345678.9:628.15,currency:'USD'},deliveredCodes:334,unreadCount:2,orders,orderTabs:tabs,orderCounts:counts,activeTab:active,currentPage:page,pageCount:Math.max(1,Math.ceil(counts[active.value]/5)),pageSize:5,pageNumbers:page===1?[1,2,Math.ceil(counts[active.value]/5)]:[1,2,3,Math.ceil(counts[active.value]/5)],isOrdersView:params.get('view')==='orders',error:params.get('error')||undefined}));",
].join('\n'));

(async () => {
  await new Promise((resolve, reject) => require('next/dist/compiled/webpack/webpack').webpack({
    mode: 'development', devtool: false, entry: path.join(out, 'entry.js'),
    output: { path: out, filename: 'bundle.js' },
    module: { rules: [{ test: /\.css$/, type: 'javascript/auto' }] },
    resolve: { alias: { '@': out, 'next/link': path.join(out, 'link.js'), 'next/navigation': path.join(out, 'navigation.js') } },
  }, (error, stats) => error || stats.hasErrors() ? reject(error || Error(stats.toString({ all: false, errors: true }))) : resolve()));
  const builtCss = fs.readdirSync('.next/static', { recursive: true }).filter(p => p.endsWith('.css')).map(p => fs.readFileSync(path.join('.next/static', p), 'utf8')).join('\n');
  const html = '<!doctype html><html data-store-theme="light"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>' + builtCss + '\n' + css + '\nbody{margin:0;font-family:Arial,sans-serif}#app{min-width:0}html{color-scheme:light}html[data-store-theme=dark]{color-scheme:dark}</style></head><body><div id="app"></div><script src="/bundle.js"></script></body></html>';
  const server = http.createServer((req, res) => {
    res.setHeader('Content-Type', req.url === '/bundle.js' ? 'text/javascript' : 'text/html');
    res.end(req.url === '/bundle.js' ? fs.readFileSync(path.join(out, 'bundle.js')) : html);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const { chromium } = require('C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const base = 'http://127.0.0.1:' + server.address().port;
    const open = async (query = '') => {
      await page.goto(base + '/account/dashboard' + query);
      await page.getByRole('heading', { name: /^Hello,/ }).waitFor();
    };
    await open();
    assert.equal(await page.getByRole('navigation', { name: 'Account navigation' }).locator('[aria-current=page]').innerText(), 'Overview');
    assert.equal(await page.locator('a[href*="business"],a[href*="portal"]').count(), 0);
    assert.equal(await page.getByRole('link', { name: /Manage wallet/ }).getAttribute('href'), '/account/wallet');
    assert.equal(await page.getByRole('link', { name: 'Contact support' }).getAttribute('href'), '/contact-us');
    assert.equal(await page.getByRole('link', { name: 'Track an order' }).getAttribute('href'), '/track-order');
    assert.equal(await page.getByRole('list', { name: 'Recent orders' }).locator('li').count(), 5);
    await page.getByRole('link', { name: 'View order IP20261008164950' }).click();
    await page.waitForURL('**/account/orders/order-0');
    await open('?view=orders&status=pending&page=2');
    assert.match(await page.getByRole('navigation', { name: 'Account navigation' }).locator('[aria-current=page]').innerText(), /My orders/);
    assert.match(await page.getByRole('navigation', { name: 'Order status' }).locator('[aria-current=page]').innerText(), /Pending/);
    assert.equal(await page.getByRole('link', { name: 'Next order page' }).getAttribute('href'), '/account/dashboard?view=orders&status=pending&page=3#orders');
    await page.getByRole('navigation', { name: 'Order status' }).getByRole('link', { name: /Completed/ }).click();
    await page.waitForURL('**status=completed&page=1#orders');
    assert.equal(await page.getByRole('link', { name: 'Previous order page' }).count(), 0);

    for (const edge of [false, true]) {
      await open(edge ? '?edge=1' : '');
      for (const width of [1280, 1024, 768, 600, 390, 320]) {
        await page.setViewportSize({ width, height: 1000 });
        for (const theme of ['light', 'dark']) {
          await page.evaluate(theme => document.documentElement.dataset.storeTheme = theme, theme);
          await page.evaluate(() => Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))));
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No horizontal overflow at ' + width + ' ' + theme + ' edge=' + edge);
          const lowContrast = await page.evaluate(() => {
            const luminance = color => {
              const rgb = color.match(/[\d.]+/g).slice(0, 3).map(Number).map(value => value / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
              return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
            };
            return [...document.querySelectorAll('.test_Dashboard_orderItem strong,.test_Dashboard_orderPrice,.test_Dashboard_status,.test_Account_navLink,.test_Dashboard_supportLink')].filter(element => {
              let surface = element;
              while (surface.parentElement && getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)') surface = surface.parentElement;
              const a = luminance(getComputedStyle(element).color), b = luminance(getComputedStyle(surface).backgroundColor);
              return (Math.max(a, b) + .05) / (Math.min(a, b) + .05) < 4.5;
            }).map(element => element.textContent);
          });
          assert.deepEqual(lowContrast, [], 'Readable account text at ' + width + ' ' + theme);
          const overlaps = await page.locator('.test_Dashboard_orderRow').evaluateAll(rows => rows.some(row => {
            const detail = row.querySelector('.test_Dashboard_orderDetails').getBoundingClientRect();
            const price = row.querySelector('.test_Dashboard_orderPrice').getBoundingClientRect();
            return detail.right > price.left;
          }));
          assert(!overlaps, 'Product names and prices do not overlap at ' + width);
          if ([1280, 390].includes(width)) await page.screenshot({ path: path.join(out, 'account-' + width + '-' + theme + (edge ? '-long' : '') + '.png'), fullPage: true });
        }
      }
    }
    assert(await page.getByText('Second product in the same order', { exact: true }).isVisible());
    await open('?empty=1');
    assert(await page.getByRole('link', { name: 'Browse products' }).isVisible());
    assert.equal(await page.getByRole('navigation', { name: 'Order pages' }).count(), 0);
    await open('?empty=1&status=pending');
    assert(await page.getByRole('heading', { name: 'No pending orders' }).isVisible());
    assert(await page.getByRole('link', { name: 'View all orders' }).isVisible());
    await open('?error=An%20order%20could%20not%20be%20opened');
    assert.equal(await page.getByRole('alert').innerText(), 'An order could not be opened');
    await page.evaluate(() => window.dispatchEvent(new Event('appinstalled')));
    await page.getByText('Customer App Installed', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForFunction(() => window.signedOut === true);
    await page.goto(base + '/account/portal/security');
    await page.getByRole('heading', { name: /^Hello,/ }).waitFor();
    assert.equal(await page.getByRole('navigation', { name: 'Account navigation' }).count(), 0, 'Retail sidebar must not appear inside the business portal');
    assert.deepEqual(errors, []);
    console.log('PASS: desktop/mobile layouts, light/dark themes, long and multi-item orders, navigation, status filters, pagination, empty states, install state, sign-out and business-shell separation. Sample data only.');
    console.log('Screenshots: ' + out);
  } finally {
    await browser.close();
    server.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
