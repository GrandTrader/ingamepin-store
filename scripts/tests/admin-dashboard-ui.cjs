const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { chromium } = require('C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = process.cwd();
const fixture = path.join(root, 'tmp/admin-dashboard-fixture');
const origin = 'http://127.0.0.1:3016';
const failureFile = path.join(fixture, 'fail-summary');
const write = (file, source) => {
  const target = path.join(fixture, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, source);
};

write('package.json', JSON.stringify({ name: 'isolated-admin-dashboard-test', private: true }));
write('tsconfig.json', JSON.stringify({ compilerOptions: { target: 'ES2022', lib: ['dom', 'esnext'], jsx: 'react-jsx', module: 'esnext', moduleResolution: 'bundler', esModuleInterop: true, skipLibCheck: true, paths: { '@/*': ['../../*'] } }, include: ['**/*.ts', '**/*.tsx', '.next/types/**/*.ts'] }));
write('next.config.js', `module.exports={devIndicators:false,turbopack:{root:${JSON.stringify(root)}}};`);
write('postcss.config.mjs', 'export default {plugins:{"@tailwindcss/postcss":{}}};');
write('styles.css', '@import "../../app/globals.css";@source "../../components";@source "../../app/admin";@source "./";');
write('app/layout.tsx', `import '../styles.css';import StorefrontFrame from '@/components/StorefrontFrame';export default function Layout({children}:{children:React.ReactNode}){return <html><body><StorefrontFrame header={<div>Retail header</div>} footer={<div>Retail footer</div>} extras={null}>{children}</StorefrontFrame></body></html>}`);
for (const file of ['app/admin/layout.tsx', 'app/admin/DashboardRetry.tsx', 'app/admin/AdminOrderLink.tsx', 'app/loading.tsx']) write(file, fs.readFileSync(file, 'utf8'));
write('app/admin/page.tsx', fs.readFileSync('app/admin/page.tsx', 'utf8').replace('"@/lib/supabase/server"', '"../../fixture-session"').replace('"@/lib/supabase/admin"', '"../../fixture-db"'));
write('app/admin/actions.ts', `'use server';export async function adminLogout(){}export async function sendTestEmail(){}`);
write('fixture-session.ts', `export async function createClient(){return {auth:{getUser:async()=>{await new Promise(r=>setTimeout(r,600));return {data:{user:{id:'owner',email:'owner@example.test'}}}},signOut:async()=>{}},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:{role:'OWNER'},error:null})})})})}}`);
write('fixture-db.ts', `import {existsSync} from 'node:fs';export function createAdminClient(){const failure=existsSync(${JSON.stringify(failureFile)});return {from(table:string){let columns='',count=false,filter='';const q:any={select(c:string,o?:any){columns=c;count=!!o?.head;return q},eq(_:string,value:string){filter=value;return q},in(_:string,value:string[]){filter=value.join(',');return q},gte(){return q},order(){return q},limit(){return q},abortSignal(){return q},then(ok:any,fail:any){const recent=columns.includes('order_number');return new Promise(r=>setTimeout(()=>r(recent?{data:[{id:'test-order',order_number:'TEST-1042',customer_name:'Test customer',total:123.45,currency:'USD',status:'DELIVERED',created_at:'2026-10-21T00:00:00Z'}],error:null}:failure?{data:null,count:null,error:{message:'Fixture database unavailable'}}:count?{count:table==='payments'?2:filter?5:1042,error:null}:{data:[{total:331.25}],error:null}),recent?250:2200)).then(ok,fail)}};return q}}}`);
write('app/admin/orders/page.tsx', `import Link from '@/components/NavigationLink';export default async function Page(){await new Promise(r=>setTimeout(r,1200));return <main className="p-5"><h1>Orders</h1><Link href="/admin">Back to overview</Link></main>}`);
write('app/api/admin/order-notifications/route.ts', `export async function GET(){return Response.json({count:5,orderStatusCounts:{pending:1,review:2,processing:5,completed:10,trash:0}})}`);
if (fs.existsSync(failureFile)) fs.unlinkSync(failureFile);

(async () => {
  const logs = [];
  const server = spawn(process.execPath, [require.resolve('next/dist/bin/next'), 'dev', fixture, '--port', '3016', '--hostname', '127.0.0.1'], { cwd: root, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  server.stdout.on('data', data => logs.push(data.toString()));
  server.stderr.on('data', data => logs.push(data.toString()));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    let ready = false;
    for (let i = 0; i < 80; i++) {
      try { const response = await fetch(origin + '/admin'); if (response.ok) { await response.text(); ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    assert(ready, logs.join('').slice(-3000));
    await (await fetch(origin + '/admin/orders')).text();
    for (const width of [320, 390, 768, 1440]) {
      const page = await browser.newPage({ viewport: { width, height: 900 } });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      const start = Date.now();
      await page.goto(origin + '/admin', { waitUntil: 'commit' });
      await page.getByRole('heading', { name: 'Store overview', exact: true }).waitFor();
      const frameTime = Date.now() - start;
      assert.equal(await page.locator('[data-admin-sidebar]').count(), 1);
      assert.equal(await page.getByText('Loading page...', { exact: true }).count(), 0);
      assert.equal(await page.getByRole('region', { name: 'Store totals' }).getAttribute('aria-busy'), 'true');
      assert.equal(await page.getByText('Retail header', { exact: true }).count(), 0);
      await page.getByRole('textbox', { name: 'Test customer email' }).fill('draft@example.test');
      await page.getByRole('link', { name: 'TEST-1042', exact: true }).waitFor();
      assert.equal(await page.getByRole('region', { name: 'Store totals' }).getAttribute('aria-busy'), 'true', 'Recent orders should arrive before delayed totals');
      await page.locator('[aria-label="Store totals"][aria-busy="false"]').waitFor();
      const totalsTime = Date.now() - start;
      assert.equal(await page.getByRole('textbox', { name: 'Test customer email' }).inputValue(), 'draft@example.test', 'Streaming must preserve a typed draft');
      assert(await page.getByRole('link', { name: /5 processing orders waiting for delivery/ }).isVisible() || width < 1024);
      assert.equal(await page.getByRole('region', { name: 'Store totals' }).getByText('1042', { exact: true }).count(), 1);
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'No viewport overflow');
      assert(await page.locator('[data-admin-scroll]').evaluate(el => el.scrollWidth <= el.clientWidth), 'One admin frame, without horizontal page overflow');
      await page.screenshot({ path: path.join(fixture, 'overview-' + width + '.png') });

      await page.evaluate(() => { window.originalFrame = document.querySelector('[data-admin-frame]'); });
      await page.getByRole('link', { name: 'View all', exact: true }).click();
      await page.waitForTimeout(200);
      assert(await page.getByRole('heading', { name: 'Store overview', exact: true }).isVisible(), 'Keep the current page during navigation');
      assert.equal(await page.getByText('Loading page...', { exact: true }).count(), 0);
      await page.getByRole('heading', { name: 'Orders', exact: true }).waitFor();
      assert(await page.evaluate(() => window.originalFrame === document.querySelector('[data-admin-frame]')));
      assert.equal(await page.locator('[data-admin-sidebar]').count(), 1);
      assert.deepEqual(errors, []);
      console.log('PASS ' + width + 'px: frame ' + frameTime + 'ms; totals ' + totalsTime + 'ms; independent streaming, persistent navigation, no overflow.');
      await page.close();
    }

    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    fs.writeFileSync(failureFile, 'on');
    await page.goto(origin + '/admin');
    await page.getByRole('alert').filter({ hasText: 'The overview could not be updated.' }).waitFor();
    assert(await page.getByRole('link', { name: 'TEST-1042', exact: true }).isVisible());
    assert.equal(await page.getByText('No orders available.', { exact: true }).count(), 0);
    fs.unlinkSync(failureFile);
    await page.getByRole('button', { name: 'Retry', exact: true }).click();
    await page.locator('[aria-label="Store totals"][aria-busy="false"]').waitFor();
    await page.getByRole('alert').filter({ hasText: 'The overview could not be updated.' }).waitFor({ state: 'hidden' });
    assert.equal(await page.locator('[data-admin-sidebar]').count(), 1);
    console.log('PASS database error: other sections stay usable and Retry restores totals.');
    await page.close();
  } catch (error) {
    console.error(logs.join('').slice(-4000));
    throw error;
  } finally {
    await browser.close();
    if (fs.existsSync(failureFile)) fs.unlinkSync(failureFile);
    if (process.platform === 'win32') spawnSync('taskkill', ['/PID', String(server.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
    else server.kill();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
