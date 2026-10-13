const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const exportsForTest = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/product-customer-fields-save.ts', 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: exportsForTest, require: name => { assert.equal(name, 'server-only'); return {}; } });
const { readCustomerFields, prepareCustomerFieldsSave } = exportsForTest;
const id = 'd256bb36-9310-4a80-9b5b-085239970a03';
const field = { id, label: 'Username', placeholder: '@vanya777', field_type: 'TEXT', is_required: true, sort_order: 0 };
function fixture({ enabled = false, fk = true, failed = false } = {}) {
  const rows = [{ ...field }], writes = [];
  const db = { from(table) {
    let operation = 'read', payload, ids;
    const q = { select() { return q; }, eq(key, value) { if (key === 'id') ids = [value]; return q; },
      in(key, value) { assert.equal(key, 'id'); ids = value; return q; },
      update(value) { operation = 'update'; payload = value; return q; },
      insert(value) { operation = 'insert'; payload = value; return q; }, delete() { operation = 'delete'; return q; },
      maybeSingle() { return q; }, single() { return q; },
      then(resolve) {
        if (failed) return Promise.resolve(resolve({ error: { code: 'CONNECTION_ERROR' } }));
        if (operation !== 'read') {
          writes.push({ table, operation, payload, ids });
          assert.equal(table, 'product_customer_fields');
          if (operation === 'update') Object.assign(rows.find(row => ids.includes(row.id)), payload);
          if (operation === 'delete') rows.splice(0, rows.length, ...rows.filter(row => !ids.includes(row.id)));
          if (operation === 'insert') rows.push(...payload.map((row, i) => ({ ...row, id: 'new-' + i })));
        }
        const data = table === 'products' ? { stock_source: enabled ? 'FKWALLET' : 'OWNED' }
          : table === 'fkwallet_imports' ? fk ? { customer_fields: [{ fieldId: id, fieldType: 'TEXT' }] } : null
          : rows.filter(row => !ids || ids.includes(row.id)).map(row => ({ ...row }));
        return Promise.resolve(resolve({ data, error: null }));
      },
    }; return q;
  } };
  return { db, rows, writes };
}
function form(overrides = {}) {
  const f = new FormData();
  for (const [key, value] of Object.entries({ id, label: 'Username', placeholder: '@ingamepin', type: 'TEXT', required: '0', ...overrides })) {
    if (value !== null) f.append('customer_field_' + key, value);
  }
  return f;
}
test('editing a Telegram username example preserves the immutable supplier field ID across repeated saves', async () => {
  const t = fixture(); const fields = readCustomerFields(form());
  const save = await prepareCustomerFieldsSave(t.db, 'product', fields);
  assert.equal(t.writes.length, 0, 'preflight does not mutate');
  await save();
  assert.equal(t.rows[0].id, id); assert.equal(t.rows[0].placeholder, '@ingamepin');
  assert.deepEqual(t.writes.map(row => row.operation), ['update']);
  await (await prepareCustomerFieldsSave(t.db, 'product', fields))();
  assert.equal(t.writes.length, 1, 'unchanged saves do not write');
});
test('unchanged enabled supplier forms save without triggering the database mutation guard', async () => {
  const t = fixture({ enabled: true });
  await (await prepareCustomerFieldsSave(t.db, 'product', [{ ...field }]))();
  assert.equal(t.writes.length, 0);
  await assert.rejects(prepareCustomerFieldsSave(t.db, 'product', [{ ...field, placeholder: '@changed' }]), /Disable FKWallet/);
  assert.equal(t.writes.length, 0);
});
test('supplier fields cannot be removed, replaced, duplicated, made optional or assigned a different type', async () => {
  for (const fields of [[], [{ ...field, id: null }], [{ ...field, is_required: false }], [{ ...field, field_type: 'NUMBER' }], [field, field], [{ ...field, id: 'other-product-field' }]]) {
    const t = fixture(); await assert.rejects(prepareCustomerFieldsSave(t.db, 'product', fields)); assert.equal(t.writes.length, 0);
  }
  const t = fixture({ failed: true }); await assert.rejects(prepareCustomerFieldsSave(t.db, 'product', [field]), /could not be checked/);
  assert.equal(t.writes.length, 0);
});
test('ordinary products can add and remove fields without replacing the fields kept in the form', async () => {
  const t = fixture({ fk: false });
  await (await prepareCustomerFieldsSave(t.db, 'product', [field, { ...field, id: null, label: 'Server', sort_order: 1 }]))();
  assert.equal(t.rows[0].id, id); assert.equal(t.rows.length, 2);
  await (await prepareCustomerFieldsSave(t.db, 'product', [field]))();
  assert.equal(t.rows.length, 1); assert.equal(t.rows[0].id, id);
  assert.deepEqual(t.writes.map(row => row.operation), ['insert', 'delete']);
});
test('malformed field identities and required indexes are rejected before persistence', () => {
  for (const value of [{ id: null }, { id: 'invalid' }, { required: '5' }, { required: 'NaN' }, { type: 'HTML' }]) assert.throws(() => readCustomerFields(form(value)));
});
test('both authenticated product editors use the preserving saver', () => {
  for (const file of ['app/admin/products/actions.ts', 'app/admin/products/[id]/edit/customer-information/actions.ts']) {
    const text = fs.readFileSync(file, 'utf8');
    const action = text.slice(text.indexOf(file.endsWith('customer-information/actions.ts') ? 'export async function saveCustomerInformation' : 'export async function updateProduct'));
    assert.match(action, /prepareCustomerFieldsSave\(admin, id,/);
    assert(action.indexOf('getAdminClient()') >= 0 || action.indexOf('admin_users') >= 0);
  }
});
