const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const test = require('node:test');
function load(file, mocks = {}) {
  const mod = { exports: {} };
  new Function('exports', 'require', 'module', ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText)(mod.exports, name => {
    if (name in mocks) return mocks[name];
    throw Error('Unexpected dependency: ' + name);
  }, mod);
  return mod.exports;
}
const lib = load('lib/paired-voucher-import.ts');
const pair = { cardNumber: '00123456789012345678', pin: '001234' };
test('CSV preserves leading zeroes, long identifiers, BOM and quoted fields', () => {
  assert.deepEqual(lib.parsePairedVoucherCsv('\ufeffcard_number,pin\r\n"00123456789012345678","001234"\r\n\r\n'), [pair]);
  assert.deepEqual(lib.parsePairedVoucherCsv('PIN,Card Number\n001234,00123456789012345678'), [pair]);
});
test('one card and PIN become exactly one customer delivery entry', () => {
  assert.deepEqual(lib.parsePairedVoucherPayload(JSON.stringify([pair])), ['Card Number: 00123456789012345678 | PIN: 001234']);
});
test('malformed, missing, extra and repeated columns are blocked', () => {
  for (const raw of ['card_number,pin\n123,', 'card_number,pin\n,123', 'card_number,pin\n123', 'card_number,pin\n123,456,789', 'card_number,card_number\n123,456', '123,456', 'card_number,pin\n"123,456', 'card_number,pin\n"123"oops,456']) assert.throws(() => lib.parsePairedVoucherCsv(raw));
});
test('duplicates with either identical or conflicting PINs reject the whole batch', () => {
  for (const pin of ['001234', '999999']) assert.throws(() => lib.validatePairedVouchers([pair, { ...pair, pin }]), /duplicate/);
});
test('numbers, scientific notation, embedded newlines and separators are rejected', () => {
  for (const cardNumber of [123456, '1.23E+17', 'A\nB', 'A\u001eB', 'A | PIN: B', 'A'.repeat(201)]) assert.throws(() => lib.validatePairedVouchers([{ ...pair, cardNumber }]));
  assert.throws(() => lib.validatePairedVouchers([{ ...pair, pin: 123456 }]));
});
test('empty, oversized and malformed payloads are rejected', () => {
  for (const raw of ['null', '{}', '[]', '[null]', 'oops']) assert.throws(() => lib.parsePairedVoucherPayload(raw));
  assert.throws(() => lib.validatePairedVouchers(Array(10001).fill(pair)), /maximum/);
  assert.throws(() => lib.parsePairedVoucherCsv('x'.repeat(1000001)), /smaller/);
});
test('CSV backup round trip retains labelled card and PIN even with quoted commas', () => {
  const value = lib.formatPairedVoucher({ cardNumber: 'CARD,"ABC"', pin: '000123' });
  const csv = '"Voucher code","Denomination"\r\n"' + value.replaceAll('"', '""') + '","15"';
  assert.equal(lib.parseVoucherCsvRecords(csv)[1][0], value);
});
function actions({ authenticated = true, allowed = true, existing = [], validOption = true } = {}) {
  const writes = [], invalidations = [];
  const session = { auth: { getUser: async () => ({ data: { user: authenticated ? { id: 'admin' } : null } }) }, from: () => ({ select(){return this},eq(){return this},maybeSingle:async()=>({data:allowed?{role:'ADMIN'}:null}) }) };
  const db = { from(table) {
    const query = { kind: 'select', select(_fields, options){this.options=options;return this},eq(){return this},in(){return this},update(value){this.kind='update';writes.push({table,value});return this},insert(value){this.kind='insert';writes.push({table,value});return this},maybeSingle:async()=>({data:table==='products'?{id:'product'}:validOption?{id:'option',product_id:'product',denomination:15}:null}),then(resolve,reject){return Promise.resolve({data:this.kind!=='select'?null:table==='gift_card_codes'?existing:table==='product_options'?[{stock_quantity:2}]:[],count:this.options?.head?2:undefined}).then(resolve,reject)} };
    return query;
  } };
  const api = load('app/admin/products/[id]/edit/ProductCodeInventoryActions.ts', {
    '@/lib/paired-voucher-import':lib,
    'next/cache':{revalidatePath:path=>invalidations.push(path)},
    'next/navigation':{redirect:path=>{throw Error('REDIRECT '+decodeURIComponent(path))}},
    '@/lib/supabase/admin':{createAdminClient:()=>db},
    '@/lib/supabase/admin-session':{createClient:async()=>session},
  });
  return { api, writes, invalidations };
}
function form(rows=[pair]) {const f=new FormData();f.set('stock_entry_format','CARD_PIN');f.set('codes_option',JSON.stringify(rows));return f;}
test('real server action saves two pairs as two entries against the chosen option', async()=>{
  const {api,writes}=actions();
  await assert.rejects(api.addCodesForOption('product','option','option',form([pair,{cardNumber:'002',pin:'000999'}])),/2 voucher code\(s\) uploaded/);
  const inserted=writes.find(x=>x.table==='gift_card_codes').value;
  assert.equal(inserted.length,2);assert.equal(inserted[0].code,lib.formatPairedVoucher(pair));assert.equal(inserted[0].product_option_id,'option');
});
test('server independently rejects tampered pair data before any writes',async()=>{
  for(const rows of [[{cardNumber:'123',pin:''}],[pair,pair]]) {const {api,writes}=actions();await assert.rejects(api.addCodesForOption('product','option','option',form(rows)),/REDIRECT.*error=/);assert.equal(writes.length,0);}
});
test('authentication, admin access, selected option and sold-code protection remain enforced',async()=>{
  for(const config of [{authenticated:false},{allowed:false},{validOption:false},{existing:[{id:'sold',code:lib.formatPairedVoucher(pair),product_id:'product',status:'SOLD'}]}]) {const {api,writes}=actions(config);await assert.rejects(api.addCodesForOption('product','option','option',form()),/REDIRECT/);assert.equal(writes.length,0);}
});
test('legacy single codes and multiline delivery bundles retain their format',async()=>{
  for(const [content,separator,count] of [['CODE-A\nCODE-B','',2],['Bundle first\nBundle second\u001eNEXT-BUNDLE','RECORD_SEPARATOR',2]]) {
    const {api,writes}=actions();const f=new FormData();f.set('codes_option',content);f.set('entry_separator',separator);
    await assert.rejects(api.addCodesForOption('product','option','option',f),/uploaded/);
    const items=writes.find(x=>x.table==='gift_card_codes').value;assert.equal(items.length,count);assert.equal(items[0].code,separator?'Bundle first\nBundle second':'CODE-A');
  }
});

test('pasted text accepts twenty headerless pairs without changing identifiers', () => {
  const rows = Array.from({length:20}, (_,i)=>({cardNumber:'0012345678901234'+String(i).padStart(2,'0'),pin:'00'+String(i).padStart(4,'0')}));
  const raw = rows.map(row=>row.cardNumber+','+row.pin).join('\r\n');
  assert.deepEqual(lib.parsePairedVoucherText(raw),rows);
  assert.deepEqual(lib.parsePairedVoucherText('card_number,pin\n'+raw),rows);
  assert.deepEqual(lib.parsePairedVoucherText('PIN,Card Number\n001234,00123456789012345678'),[pair]);
});
test('pasted text rejects invalid pairs and duplicates as a whole batch', () => {
  for (const raw of ['', '123', '123,', '123,456,789', '123,456\n123,789', 'card_number,pin\n123,', '1.23e+17,123456']) assert.throws(()=>lib.parsePairedVoucherText(raw));
  assert.deepEqual(lib.parsePairedVoucherText('\n00123456789012345678,001234\n\n'),[pair]);
});
