const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const clone = value => JSON.parse(JSON.stringify(value));
function load(file, deps = {}, globals = {}) {
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
  {exports,Buffer,AbortSignal,Date,process,require:name=>name==='server-only'?{}:name in deps?deps[name]:name.startsWith('node:')?require(name):(()=>{throw Error(name)})(),...globals});
 return exports;
}
const api = load('lib/fkwallet-api.ts'), imports = load('lib/fkwallet-import.ts');
const credentials = {publicKey:'stock-test-public-key',privateKey:'stock-test-private-key'};
const field = {key:'Input1',type:'text',label:'Username',values:[]};
const supplier = {id:9,price:10,currency:'RUB',price_type:'FIXED',product_type:'DEFAULT',fields:[field],params:[]};
function fixture(config = {}) {
 const products = config.products ?? [{id:'telegram',category:2},{id:'game',category:59},{id:'another-telegram',category:2}];
 const calls = [], writes = [], warnings = [], waits = [];
 const db = {from(table) {
  let productId;
  const query = {select(){return query},eq(key,value){if(key==='product_id')productId=value;return query},lt(){return query},order(){return query},limit(){return query},single(){return query},
   async upsert(){return {error:null}},then(resolve,reject){
    const row = products.find(p=>p.id===productId);
    const data = table==='fkwallet_delivery_settings'?products.map(p=>({product_id:p.id}))
     :table==='fkwallet_imports'?{connection_id:config.connection??api.connectionId(credentials),supplier_category_id:row.category,customer_fields:[{key:'Input1',fieldType:'TEXT'}]}
     :table==='fkwallet_product_links'?[{option_id:productId+'-option',supplier_product_id:9,supplier_currency:'RUB',supplier_cost:10}]:null;
    return Promise.resolve({data,error:null}).then(resolve,reject);
   }}; return query;
 },async rpc(name,args){
  assert(['claim_supplier_job','sync_fkwallet_stock'].includes(name),'Stock refresh cannot submit a purchase');
  if(name==='claim_supplier_job')return {data:null,error:null};
  writes.push(clone(args));return {data:null,error:config.saveError?{}:null};
 }};
 const request = async(c,endpoint,body)=>{
  assert.equal(body,undefined,'All refresh requests must be GET');
  assert(endpoint==='balance'||/^op\/categories\/\d+\/products$/.test(endpoint));
  calls.push(endpoint);const attempt=calls.filter(e=>e===endpoint).length;
  if(config.reject)await config.reject(endpoint,attempt);
  if(endpoint==='balance') {
   if(config.oneBalanceOnly&&attempt>1)throw new api.FKError('FKWallet request failed (HTTP 429).',429);
   return config.balances??[{currency_code:'RUB',value:105}];
  }
  return config.catalogue??[supplier];
 };
 const worker=load('lib/fkwallet-fulfillment.ts',{
  '@/lib/supabase/admin':{createAdminClient:()=>db},'./fkwallet-api':{...api,fkRequest:request},'./fkwallet-import':imports,
  './fkwallet-storage':{requireCredentials:async()=>credentials},'node:timers/promises':{setTimeout:async ms=>waits.push(ms)},
 },{process:{env:{FKWALLET_FULFILLMENT_ENABLED:'true'}},console:{warn:(...args)=>warnings.push(args)}});
 return {worker,db,calls,writes,warnings,waits,run:()=>worker.runFKDeliveryTick()};
}

test('worker shares authentication balance across all products and reads each category once',async()=>{
 const f=fixture({oneBalanceOnly:true});const result=await f.run();
 assert.deepEqual(clone(result),{state:'idle',stockUpdated:3,stockFailed:0});
 assert.equal(f.calls.filter(e=>e==='balance').length,1);
 assert.equal(f.calls.filter(e=>e==='op/categories/2/products').length,1);
 assert.equal(f.calls.filter(e=>e==='op/categories/59/products').length,1);
 assert.equal(f.writes.length,3);assert(f.writes.every(w=>w.p_rows[0].quantity===10));assert.equal(f.warnings.length,0);
});

test('stock snapshots are fresh on the next tick and cannot be reused for another account',async()=>{
 const f=fixture();await f.run();await f.run();assert.equal(f.calls.filter(e=>e==='balance').length,2);
 const reader=f.worker.createFKStockReader({...credentials,publicKey:'different-public-key'});
 await assert.rejects(f.worker.syncFKProductStock(f.db,credentials,'telegram',reader),/connection has changed/);
 assert.equal(f.writes.length,6);
});

test('temporary throttling and server failures retry only reads, then save real availability',async()=>{
 const f=fixture({reject(endpoint,attempt){if(endpoint.includes('/2/')&&attempt<3)throw new api.FKError('FKWallet request failed (HTTP 429).',429,1500)}});
 const result=await f.run();assert.equal(result.stockFailed,0);assert.equal(result.stockUpdated,3);
 assert.deepEqual(f.waits,[1500,1500]);assert.equal(f.calls.filter(e=>e.includes('/2/')).length,3);
 assert(f.writes.every(w=>w.p_rows.length===1&&w.p_rows[0].quantity===10),'No false zero snapshot saved during retries');
 const unavailable=fixture({reject(endpoint,attempt){if(endpoint==='balance'&&attempt===1)throw new api.FKError('FKWallet request failed (HTTP 503).',503)}});
 assert.equal((await unavailable.run()).stockFailed,0);assert.deepEqual(unavailable.waits,[1000]);
});

test('exhausted category reads close affected stock and report failure while other categories refresh',async()=>{
 const f=fixture({reject(endpoint){if(endpoint.includes('/2/'))throw new api.FKError('FKWallet request failed (HTTP 429).',429)}});
 const result=await f.run();assert.equal(result.stockFailed,2);assert.equal(result.stockUpdated,1);
 assert.equal(f.writes.find(w=>w.p_product_id==='game').p_rows[0].quantity,10);
 assert(f.writes.filter(w=>w.p_product_id!=='game').every(w=>w.p_rows.length===0));
 assert.equal(f.calls.filter(e=>e.includes('/2/')).length,3);assert.equal(f.warnings.length,2);
});

test('authentication failures, malformed data and long cooldowns are not retried early',async()=>{
 for(const [status,wait] of [[403,undefined],[429,60000]]) {
  const f=fixture({reject(endpoint){if(endpoint==='balance')throw new api.FKError('Supplier read failed',status,wait)}});
  await assert.rejects(f.run(),/Supplier read failed/);assert.deepEqual(f.calls,['balance']);assert.equal(f.writes.length,0);assert.equal(f.waits.length,0);
 }
 const malformed=fixture({catalogue:[{...supplier,price:null}]});
 const result=await malformed.run();assert.equal(result.stockFailed,3);assert.equal(malformed.waits.length,0);
});

test('real unavailability, insufficient funds, price increases and changed fields still close stock',async()=>{
 for(const config of [{catalogue:[]},{balances:[{currency_code:'RUB',value:5}]},{catalogue:[{...supplier,price:11}]},{catalogue:[{...supplier,currency:'USD'}]},{catalogue:[{...supplier,fields:[]}]},{catalogue:[{...supplier,fields:[{...field,key:'Different'}]}]}]) {
  const f=fixture(config);const result=await f.run();assert.equal(result.stockFailed,0);
  assert(f.writes.every(w=>w.p_rows[0].quantity===0),JSON.stringify(config));
 }
 const f=fixture({balances:[{currency_code:'RUB',value:9999999}]});await f.run();assert(f.writes.every(w=>w.p_rows[0].quantity===1000));
});

test('single-product refresh uses the same retries and fails visibly when saving fails',async()=>{
 const f=fixture({saveError:true});await assert.rejects(f.worker.syncFKProductStock(f.db,credentials,'telegram'),/could not save/);
 assert.equal(f.calls.filter(e=>e==='balance').length,1);
});

test('HTTP retry metadata is preserved without exposing provider bodies or credentials',async()=>{
 for(const [header,expected] of [['2',2000],['invalid',undefined]]) {
  const client=load('lib/fkwallet-api.ts',{}, {fetch:async()=>new Response('private supplier response',{status:429,headers:{'Retry-After':header}})});
  await assert.rejects(client.fkRequest(credentials,'balance'),error=>{
   assert.equal(error.httpStatus,429);assert.equal(error.retryAfterMs,expected);assert.equal(error.message,'FKWallet request failed (HTTP 429).');return true;
  });
 }
});

test('scheduler reports partial refresh failure instead of a misleading success',async()=>{
 const secret='stock-test-strong-cron-secret';
 for(const stockFailed of [0,1]) {
  const route=load('app/api/cron/fkwallet/route.ts',{
   'next/server':{NextResponse:{json:Response.json}},'@/lib/fkwallet-fulfillment':{runFKDeliveryTick:async()=>({state:'idle',stockUpdated:2-stockFailed,stockFailed})},
   '@/lib/digiseller-fkwallet-fulfillment':{runDigiFKDeliveryTick:async()=>({state:'idle'})},
  },{process:{env:{CRON_SECRET:secret}}});
  const response=await route.GET({headers:new Headers({authorization:'Bearer '+secret})});
  assert.equal(response.status,stockFailed?503:200);assert.equal((await response.json()).ok,stockFailed===0);
 }
});
