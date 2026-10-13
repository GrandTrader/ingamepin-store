const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const crypto = require('node:crypto');

function load(file, dependencies = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(code, { exports, require(name) { if (name === 'server-only') return {}; if (name in dependencies) return dependencies[name]; if (name.startsWith('node:')) return require(name); throw Error(name); }, Buffer, AbortSignal, Date, process, ...globals });
  return exports;
}
const creds = { publicKey: 'public-key-for-test', privateKey: 'private-key-for-test' };
const api = load('lib/fkwallet-api.ts');
const clone = value => JSON.parse(JSON.stringify(value));

test('signs the exact UTF-8 JSON body; GET signs only the private key', async () => {
  const calls = [];
  const client = load('lib/fkwallet-api.ts', {}, { fetch: async (url, options) => { calls.push({url, ...options}); return Response.json({ status: 'ok', data: [] }); } });
  const body = { online_product_id: 1, fields: [{key:'email', value:'é@example.com'}] };
  await client.fkRequest(creds, 'op/validate', body);
  await client.fkRequest(creds, 'balance');
  assert.equal(calls[0].body, JSON.stringify(body));
  assert.equal(calls[0].headers.Authorization, 'Bearer ' + crypto.createHash('sha256').update(calls[0].body + creds.privateKey).digest('hex'));
  assert.equal(calls[1].headers.Authorization, 'Bearer ' + crypto.createHash('sha256').update(creds.privateKey).digest('hex'));
  assert.equal(calls[1].body, undefined);
  assert.equal(calls[0].cache, 'no-store');
  assert.equal(calls[0].redirect, 'error');
  await assert.rejects(client.fkRequest(creds, '../withdrawal'), /Unsupported/);
  await assert.rejects(client.fkRequest(creds, 'withdrawal', {}), /Unsupported/);
  assert.equal(calls.length, 2, 'payouts are excluded from this integration');
});
test('accepts the documented nested envelope and normal envelope, but never assumes an error is success', () => {
  assert.deepEqual(clone(api.unwrapResponse({data:{status:'ok',data:[{id:1}]}})), [{id:1}]);
  assert.deepEqual(clone(api.unwrapResponse({status:'ok',data:{id:2}})), {id:2});
  assert.equal(api.unwrapResponse({data:{status:'ok'}}), null);
  for (const data of [{status:'error',data:{}},{data:[{}]},{status:1},{data:{status:'fail'}}]) assert.throws(() => api.unwrapResponse(data));
});
test('network and upstream failures never reveal private data or automatically retry', async () => {
  let attempts = 0;
  const client = load('lib/fkwallet-api.ts', {}, { fetch: async () => { attempts++; throw Error('private-key-for-test and an account'); } });
  await assert.rejects(client.fkRequest(creds, 'op/create', {}), error => !error.message.includes(creds.privateKey) && /could not be reached/.test(error.message));
  assert.equal(attempts, 1);
  const bad = load('lib/fkwallet-api.ts', {}, { fetch: async () => Response.json({message:creds.privateKey}, {status:403}) });
  await assert.rejects(bad.fkRequest(creds, 'balance'), error => !error.message.includes(creds.privateKey) && /denied access/.test(error.message));
});
test('invalid catalogue amounts fail closed and balances preserve their actual currency', () => {
  assert.deepEqual(clone(api.parseBalances([{currency_code:'RUB',value:'125.50'},{currency_code:'USD',value:4.03}])), [{currency:'RUB',value:125.5},{currency:'USD',value:4.03}]);
  for (const value of [null, undefined, true, '', 'free', Infinity]) {
    assert.throws(() => api.parseProducts([{id:1,price:value,currency:'USD'}]));
    assert.throws(() => api.parseBalances([{currency_code:'USD',value}]));
  }
  for (const amount of [null, true, -1, 0, '1e9', Infinity]) assert.throws(() => api.positiveAmount(amount));
});
test('balance collections accept numeric-keyed rows and currency-keyed amounts without losing zero balances', () => {
  const expected=[{currency:'RUB',value:0},{currency:'USD',value:125.5}];
  for(const balances of [
    {'1':{currency_code:'RUB',value:'0.00'},'6':{currency_code:'USD',value:'125.50'}},
    {RUB:'0.00',USD:'125.50'},
    {RUB:{value:'0.00'},USD:{currency_code:'USD',value:'125.50'}},
  ]) assert.deepEqual(clone(api.parseBalances(balances)),expected);
  assert.deepEqual(clone(api.parseBalances({BTC:' 1.2e-8 ',ETH:'0E-8'})),[{currency:'BTC',value:0.000000012},{currency:'ETH',value:0}]);
  assert.deepEqual(clone(api.parseCurrencies({'1':{id:1,code:'RUB'},'6':{id:6,code:'USD'}})),[{id:1,code:'RUB'},{id:6,code:'USD'}]);
  for(const invalid of [{USD:null},{USD:true},{USD:'1,234'},{USD:'1e999'},{USD:{currency_code:'RUB',value:20}},{'1':{currency_code:'USD'}}]) assert.throws(()=>api.parseBalances(invalid));
});
test('encrypted credentials/results cannot be read using another transaction binding', () => {
  const storage = load('lib/fkwallet-storage.ts', {'@/lib/supabase/admin':{}, './fkwallet-api':api}, {process:{env:{FKWALLET_ENCRYPTION_KEY:'x'.repeat(40)}}});
  const ciphertext = storage.seal({code:'TEST-SECRET'}, 'order-a');
  assert.ok(!ciphertext.includes('TEST-SECRET'));
  assert.deepEqual(clone(storage.unseal(ciphertext,'order-a')), {code:'TEST-SECRET'});
  assert.throws(() => storage.unseal(ciphertext,'order-b'));
});

const id = '11111111-1111-4111-8111-111111111111';
function actionSetup(options = {}) {
  let row = { id, admin_user_id:'admin', connection_id:api.connectionId(creds), state:'READY', expires_at:new Date(Date.now()+120000).toISOString(),
    summary:{title:'Test card', categoryId:1,productId:2,listedPrice:10,currency:'USD',amount:10}, request_ciphertext:'sealed',provider_id:null };
  row = {...row,...options.row};
  const calls = [];
  const request = {online_product_id:2,currency_id:1,fields:[],idempotence_key:'igp-'+id};
  const db = { from(table) {
    let update, insert, predicates=[];
    const query = {
      select(){return this},eq(k,v){predicates.push(r=>r[k]===v);return this},gt(k,v){predicates.push(r=>r[k]>v);return this},
      order(){return this},limit(){return this},update(v){update=v;return this},insert(v){insert=v;return this},upsert(v){insert=v;return this},
      async single(){return this.execute()},async maybeSingle(){return this.execute()},
      then(resolve,reject){return this.execute().then(resolve,reject)},
      async execute(){
        calls.push(['db',table, update ? clone(update) : insert ? 'insert' : 'read']);
        if(insert){if(options.failInsert)return {data:null,error:{message:'database down'}};row={...row,...insert};return {data:clone(row),error:null};}
        if(!predicates.every(p=>p(row))) return {data:null,error:null};
        if(update && options.failClaim && update.state==='SUBMITTING')return {data:null,error:{message:'database down'}};
        if(update)row={...row,...update};
        return {data:clone(row),error:null};
      },
    }; return query;
  }};
  const provider = async (credentials,endpoint,body) => {
    calls.push(['api',endpoint,body]);
    if(endpoint==='balance'){if(options.deniedKey)throw new api.FKError('FKWallet denied access.');return options.balance ?? {USD:'10.00'};}
    if(endpoint.includes('/products')) return [{id:2,name_en:'Test card',price:options.price ?? 10,currency:'USD',params:[],fields:[]}];
    if(endpoint==='currencies')return [{id:1,code:'USD'}];
    if(endpoint==='op/validate') {if(options.failValidate)throw new api.FKError('Validation failed'); return null;}
    if(endpoint==='op/create') {if(options.timeout)throw new api.FKError('network');return {id:42,status:0,coupon_code:'TEST-CODE'};}
    if(endpoint==='op/status/42')return {id:42,status:1,coupon_code:'TEST-CODE'};
    throw Error('Unexpected endpoint '+endpoint);
  };
  const actions = load('app/admin/fkwallet/actions.ts', {
    'next/cache':{revalidatePath(){}},
    '@/lib/fkwallet-admin':{requireFKAdmin:async()=>{calls.push(['auth']);if(options.denied)throw Error('denied');return {db,userId:'admin'};}},
    '@/lib/fkwallet-api':{...api,fkRequest:provider,findFKOrderHistory:async()=>({status:'success'})},
    '@/lib/fkwallet-storage':{requireCredentials:async()=>creds,seal:value=>JSON.stringify(value),unseal:()=>request,environmentConfigured:()=>false,readCredentials:async()=>creds},
  });
  return {actions,calls,row:()=>row};
}
test('every admin entry point authenticates before provider or database access', async () => {
  const t=actionSetup({denied:true});
  for(const fn of [()=>t.actions.loadFKDashboard(),()=>t.actions.connectFKWallet(new FormData()),()=>t.actions.loadFKProducts(1),()=>t.actions.prepareFKPurchase({}),()=>t.actions.confirmFKPurchase(id),()=>t.actions.refreshFKPurchase(id),()=>t.actions.readFKPurchaseResult(id),()=>t.actions.cancelFKReview(id)])await assert.rejects(fn,/denied/);
  assert.equal(t.calls.filter(c=>c[0]!=='auth').length,0);
});
test('valid authentication saves keys independently of balance presentation; rejected keys are never saved', async () => {
  const form=new FormData();form.set('publicKey',creds.publicKey);form.set('privateKey',creds.privateKey);
  for(const balance of [{USD:'10.00'},{newFormat:{total:10}}]){
    const t=actionSetup({balance});assert.equal((await t.actions.connectFKWallet(form)).data,true);
    assert.equal(t.calls.filter(c=>c[0]==='db'&&c[1]==='fkwallet_settings'&&c[2]==='insert').length,1);
    assert.equal(t.calls.filter(c=>c[1]==='op/create').length,0);
  }
  const t=actionSetup({deniedKey:true});assert.ok((await t.actions.connectFKWallet(form)).error);
  assert.equal(t.calls.filter(c=>c[0]==='db').length,0);
});
test('validation prepares an immutable review without buying; changed prices and fields are rejected', async () => {
  const t=actionSetup();
  const input={categoryId:1,productId:2,expectedPrice:10,expectedCurrency:'USD',fields:[],amount:''};
  const result=await t.actions.prepareFKPurchase(input);
  assert.ok(result.data);
  assert.equal(t.calls.filter(c=>c[1]==='op/create').length,0);
  assert.equal((await t.actions.prepareFKPurchase({...input,expectedPrice:9})).data,undefined);
  assert.equal((await t.actions.prepareFKPurchase({...input,fields:[{key:'extra',value:'bad'}]})).data,undefined);
});
test('double confirmation sends exactly one paid request with the persisted idempotence key', async () => {
  const t=actionSetup();
  const results=await Promise.all([t.actions.confirmFKPurchase(id),t.actions.confirmFKPurchase(id)]);
  assert.equal(results.filter(r=>r.data).length,1);
  const paid=t.calls.filter(c=>c[1]==='op/create');
  assert.equal(paid.length,1);assert.equal(paid[0][2].idempotence_key,'igp-'+id);
  assert.equal(t.row().state,'SUBMITTED');
  assert.ok(t.row().result_ciphertext.includes('TEST-CODE'));
});
test('timeout becomes UNKNOWN; repeating confirmation does not spend again', async () => {
  const t=actionSetup({timeout:true});
  assert.ok((await t.actions.confirmFKPurchase(id)).error);
  assert.equal(t.row().state,'UNKNOWN');
  assert.ok((await t.actions.confirmFKPurchase(id)).error);
  assert.equal(t.calls.filter(c=>c[1]==='op/create').length,1);
});
test('expired reviews, changed price, other admins/accounts and failed storage cannot spend', async () => {
  for(const options of [{row:{expires_at:new Date(0).toISOString()}},{price:11},{row:{admin_user_id:'other'}},{row:{connection_id:'other'}},{failClaim:true},{failValidate:true}]) {
    const t=actionSetup(options); assert.ok((await t.actions.confirmFKPurchase(id)).error);
    assert.equal(t.calls.filter(c=>c[1]==='op/create').length,0);
  }
  const t=actionSetup({failInsert:true});
  assert.ok((await t.actions.prepareFKPurchase({categoryId:1,productId:2,expectedPrice:10,expectedCurrency:'USD',fields:[],amount:''})).error);
  assert.equal(t.calls.filter(c=>c[1]==='op/create').length,0);
});
test('status refresh retrieves results without creating another order', async () => {
  const t=actionSetup({row:{state:'SUBMITTED',provider_id:'42'}});
  const result=await t.actions.refreshFKPurchase(id);
  assert.equal(result.data.result.couponCode,'TEST-CODE');
  assert.equal(t.calls.filter(c=>c[1]==='op/create').length,0);
});
