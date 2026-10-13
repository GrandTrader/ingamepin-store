// Read-only unless --apply is supplied. The reviewed plan is required for writes.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const ts = require('typescript');
require('@next/env').loadEnvConfig(process.cwd());
const db = require('@supabase/supabase-js').createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const helper = { exports: {} };
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('lib/manual-code-range.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(helper, helper.exports);
const { manualCodeRangeDefaults } = helper.exports;
const planPath = path.resolve('tmp/manual-code-range-plan.json');
const selection = 'id,public_id,name,product_type,stock_source,delivery_type,status,product_options(id,option_name,denomination,denomination_currency,selling_price,is_active,is_custom_value),product_range_settings(enabled,delivery_mode)';
async function read() {
  const result = await db.from('products').select(selection).eq('product_type', 'GIFT_CARD').eq('stock_source', 'OWNED').eq('delivery_type', 'AUTOMATIC').eq('status', 'ACTIVE').order('id');
  if (result.error) throw Error(result.error.message);
  return result.data.map(p => ({ ...p, product_options: p.product_options.sort((a, b) => a.id.localeCompare(b.id)) }));
}
(async () => {
  const products = await read();
  if (!process.argv.includes('--apply')) {
    const plan = products.filter(p => !p.product_range_settings).flatMap(p => {
      const settings = manualCodeRangeDefaults(p, p.product_options);
      return settings ? [{ before: p, settings: { ...settings, enabled: true, delivery_mode: 'MANUAL', supplier: null, supplier_reference: null } }] : [];
    });
    fs.mkdirSync(path.dirname(planPath), { recursive: true });
    fs.writeFileSync(planPath, JSON.stringify(plan, null, 2));
    console.log(JSON.stringify(plan.map(p => ({ product: p.before.public_id, name: p.before.name, ...p.settings })), null, 2));
    return;
  }
  const plan = JSON.parse(fs.readFileSync(planPath, 'utf8'));
  assert(plan.length > 0 && plan.length <= 100, 'Review a non-empty plan first.');
  // Validate the complete plan before any writes; never overwrite existing ranges.
  for (const row of plan) {
    assert.deepEqual(products.find(p => p.id === row.before.id), row.before, 'Product settings changed; create and review a fresh plan.');
    assert(!row.before.product_range_settings);
    assert.deepEqual(row.settings, { ...manualCodeRangeDefaults(row.before, row.before.product_options), enabled: true, delivery_mode: 'MANUAL', supplier: null, supplier_reference: null });
  }
  const admins = await db.from('admin_users').select('user_id').eq('role', 'OWNER');
  if (admins.error || admins.data?.length !== 1) throw Error('A single store owner is required for this maintenance operation.');
  for (const row of plan) {
    const result = await db.rpc('save_product_range', { p_product_id: row.before.id, p_admin_id: admins.data[0].user_id, p_settings: row.settings });
    if (result.error) throw Error(`Product ${row.before.public_id}: ${result.error.message}`);
    const verified = await db.from('product_range_settings').select('enabled,currency,minimum,maximum,step,price_basis,price_usd,delivery_mode,supplier,supplier_reference').eq('product_id', row.before.id).single();
    if (verified.error) throw Error(verified.error.message);
    assert.deepEqual(verified.data, row.settings);
    console.log(`Enabled manual range: ${row.before.public_id}`);
  }
  const after = await read();
  for (const row of plan) {
    const current = after.find(p => p.id === row.before.id);
    assert.equal(current.delivery_type, 'AUTOMATIC');
    assert.deepEqual(current.product_options.filter(o => row.before.product_options.some(before => before.id === o.id)), row.before.product_options, 'Existing denomination settings must stay unchanged.');
  }
  console.log('Verified: all existing denomination prices and automatic delivery settings are unchanged.');
})().catch(e => { console.error(e.message); process.exitCode = 1; });
