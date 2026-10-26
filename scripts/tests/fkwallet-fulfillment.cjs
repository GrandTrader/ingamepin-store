const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,deps={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='server-only'?{}:n in deps?deps[n]:n.startsWith('node:')?require(n):(()=>{throw Error(n)})(),Buffer,AbortSignal,Date,process,...globals});return exports;}
const api=load('lib/fkwallet-api.ts'),imports=load('lib/fkwallet-import.ts');
const clone=x=>JSON.parse(JSON.stringify(x)),creds={publicKey:'test-public-key',privateKey:'test-private-key'};
const payload={connectionId:api.connectionId(creds),categoryId:2,productId:9,supplierCost:1108,currency:'RUB',exchangeRate:88,deliveryKind:'ACCOUNT',fieldMap:[{key:'Input1',fieldId:'field',fieldType:'TEXT'}],customerInformation:[{fieldId:'field',value:'@test'}]};
const product={id:9,price:1108,currency:'RUB',priceType:'FIXED',productType:'DEFAULT',fields:[{key:'Input1',type:'text',label:'Username',values:[]}],params:[]};
test('history matches the digital order ID, not a wallet row, and unknown statuses never mean success',()=>{
 const value=[{id:9,operation:'Withdrawal',amount:1108,currency_code:'RUB',info:{id:42,status:'success'}},{id:42,operation:'OnlineProductOrder',amount:-1108,currency_code:'RUB',info:{id:9,status:'success'}}];
 assert.deepEqual(clone(api.parseDigitalHistory(value)),[{id:'9',status:'success',amount:1108,currency:'RUB'}]);
 assert.equal(api.parseDigitalHistory([{...value[1],info:{id:9,status:1}}])[0].status,'unknown');
 assert.throws(()=>api.parseDigitalHistory([{...value[1],amount:null}]));
});
test('history lookup paginates through unrelated records and excludes every write endpoint',async()=>{
 const urls=[];const client=load('lib/fkwallet-api.ts',{}, {fetch:async(url,opts)=>{
  urls.push(url);assert.equal(opts.method,'GET');assert.equal(opts.body,undefined);
  return Response.json({status:'ok',data:urls.length===1?Array.from({length:100},(_,i)=>({id:i+1,operation:'Withdrawal'})):[{id:900,operation:'OnlineProductOrder',amount:-1108,currency_code:'RUB',info:{id:42,status:'success'}}]});
 }});
 assert.equal((await client.findFKOrderHistory(creds,'42',new Date().toISOString())).status,'success');assert.equal(urls.length,2);assert(urls[1].includes('page=2&limit=100'));
 await assert.rejects(client.fkRequest(creds,'history?date_from=2026-10-12&date_to=2026-10-13&page=1&limit=100',{}),/Unsupported/);
 await assert.rejects(client.fkRequest(creds,'history?date_from=2026-10-12&date_to=2026-10-13&page=1&limit=100&other=1'),/Unsupported/);
});
function fixture(options={}){
 const calls=[];let unit={ordinal:1,request_key:'igpfk-test-1',submitted_at:null,provider_id:null,provider_status:null,result_ciphertext:null,...options.unit};
 const job={item_id:'item',order_id:'order',lease_token:'lease',quantity:1,created_at:new Date().toISOString(),supplier_payload:{...payload,...options.payload}};
 const db={from(){return {select(){return this},eq(){return this},order:async()=>({data:[clone(unit)],error:null})}},async rpc(name,args){calls.push(['rpc',name,args]);
  if(name==='mark_fkwallet_unit_submitted'){if(options.lostLease)return {error:{}};if(unit.submitted_at)return {error:{}};unit.submitted_at=new Date().toISOString();}
  if(name==='record_fkwallet_unit'){unit.provider_id=args.p_provider_id;unit.provider_status=args.p_status;unit.result_ciphertext=args.p_result;}
  return {data:null,error:null};}};
 const provider=async(c,endpoint,body)=>{calls.push(['api',endpoint,body]);
  if(endpoint.endsWith('/products'))return [{...product,price:options.price??1108,name_en:'Telegram'}];
  if(endpoint==='currencies')return [{id:1,code:'RUB'}];if(endpoint==='balance')return [{currency_code:'RUB',value:options.balance??5000}];
  if(endpoint==='op/validate')return null;
  if(endpoint==='op/create'){if(options.timeout)throw new api.FKError('Timeout');return {id:42,status:0};}
  if(endpoint==='op/status/42')return {id:options.wrongOrder?999:42,status:options.numericStatus??999,...(options.code?{coupon_code:options.code}:{})};throw Error(endpoint);
 };
 const worker=load('lib/fkwallet-fulfillment.ts',{
  '@/lib/supabase/admin':{},'./fkwallet-api':{...api,fkRequest:provider,findFKOrderHistory:async()=>options.history??{id:'42',status:'success',amount:1108,currency:'RUB'}},
  './fkwallet-import':imports,'./fkwallet-storage':{seal:JSON.stringify,unseal:JSON.parse,requireCredentials:async()=>creds},
 });
 return {worker,calls,job,db,unit:()=>unit,run:()=>worker.processFKDelivery(db,creds,job)};
}
test('customer fields map by immutable field ID and reject changed schemas or price increases',()=>{
 const t=fixture();assert.deepEqual(clone(t.worker.fkDeliveryFields(payload,product)),[{key:'Input1',value:'@test'}]);
 for(const altered of [{...product,price:1109},{...product,currency:'USD'},{...product,fields:[]},{...product,fields:[{key:'Unknown',type:'text',values:[]}]}])assert.throws(()=>t.worker.fkDeliveryFields(payload,altered));
 assert.throws(()=>t.worker.fkDeliveryFields({...payload,customerInformation:[]},product));
});
test('the persisted submission marker precedes purchase; a crash never resubmits',async()=>{
 const t=fixture();assert.equal(await t.run(),'submitted');
 assert(t.calls.findIndex(c=>c[1]==='mark_fkwallet_unit_submitted')<t.calls.findIndex(c=>c[1]==='op/create'));
 assert.equal(t.calls.find(c=>c[1]==='op/create')[2].fields[0].value,'@test');
 assert.equal(await t.run(),'delivered');assert.equal(t.calls.filter(c=>c[1]==='op/create').length,1);
 const crashed=fixture({unit:{submitted_at:new Date().toISOString()}});assert.equal(await crashed.run(),'review');assert(!crashed.calls.some(c=>c[1]==='op/create'));
 const timeout=fixture({timeout:true});assert.equal(await timeout.run(),'review');assert.equal(await timeout.run(),'review');assert.equal(timeout.calls.filter(c=>c[1]==='op/create').length,1);
});
test('missing funds, changed supplier price, rotated account, and lost lease cannot spend',async()=>{
 for(const options of [{balance:0},{price:1110},{lostLease:true},{payload:{connectionId:'different'}}]){
  const t=fixture(options);await t.run();assert(!t.calls.some(c=>c[1]==='op/create'));
 }
});
test('only matched history success delivers; numeric status 1 alone does not',async()=>{
 for(const status of ['in_process','error','cancel','refund','unknown']){
  const t=fixture({unit:{submitted_at:new Date().toISOString(),provider_id:'42'},history:{status,amount:1108,currency:'RUB'},numericStatus:1});
  await t.run();assert(!t.calls.some(c=>c[1]==='complete_fkwallet_job'));
 }
 const t=fixture({unit:{submitted_at:new Date().toISOString(),provider_id:'42'}});assert.equal(await t.run(),'delivered');
 const completed=t.calls.find(c=>c[1]==='complete_fkwallet_job');assert.deepEqual(clone(completed[2].p_codes),[],'account activation does not require or invent a code');
});
test('code delivery requires a real code, matching supplier order, amount and currency',async()=>{
 for(const options of [{},{wrongOrder:true},{history:{status:'success',amount:1109,currency:'RUB'}},{history:{status:'success',amount:10,currency:'USD'}}]){
  const t=fixture({...options,payload:{deliveryKind:'CODE'},unit:{submitted_at:new Date().toISOString(),provider_id:'42'}});
  try{await t.run()}catch{}assert(!t.calls.some(c=>c[1]==='complete_fkwallet_job'));
 }
 const t=fixture({code:'REAL-TEST-CODE',payload:{deliveryKind:'CODE'},unit:{submitted_at:new Date().toISOString(),provider_id:'42'}});assert.equal(await t.run(),'delivered');assert.deepEqual(clone(t.calls.find(c=>c[1]==='complete_fkwallet_job')[2].p_codes),['REAL-TEST-CODE']);
});

test('delivery activation authenticates before any supplier or database operation',async()=>{
 let accessed=false;
 const actions=load('app/admin/fkwallet/delivery-actions.ts',{'next/cache':{},'@/lib/fkwallet-admin':{requireFKAdmin:async()=>{throw Error('denied')}},'@/lib/fkwallet-api':{},'@/lib/fkwallet-fulfillment':{fkDeliveryEnabled:()=>{accessed=true}},'@/lib/fkwallet-import':{},'@/lib/fkwallet-storage':{}});
 await assert.rejects(actions.configureFKDelivery('anything',true,'ACCOUNT'),/denied/);assert.equal(accessed,false);
});
test('the automatic worker authenticates before backup and supplier work',async()=>{
 const calls=[];const secret='a-strong-test-scheduler-secret';let failBackup=false;
 const route=load('app/api/cron/fkwallet/route.ts',{
  'next/server':{NextResponse:{json:Response.json}},
  '@/lib/supabase/admin':{createAdminClient:()=>{calls.push('database');return{rpc:async(name,args)=>{assert.equal(name,'fulfill_uploaded_supplier_backups');assert.equal(args.p_limit,25);calls.push('backup');return failBackup?{error:{message:'fixture database failure'}}:{data:2,error:null}}}}},
  '@/lib/fkwallet-fulfillment':{runFKDeliveryTick:async()=>{calls.push('supplier');return {state:'idle',stockFailed:0}}},
  '@/lib/digiseller-fkwallet-fulfillment':{runDigiFKDeliveryTick:async()=>{calls.push('digiseller');return {state:'idle'}}}
 },{process:{env:{CRON_SECRET:secret}}});
 for(const token of ['', 'Bearer wrong', 'Bearer '+secret+'extra'])assert.equal((await route.GET({headers:new Headers({authorization:token})})).status,401);
 assert.deepEqual(calls,[]);
 const request={headers:new Headers({authorization:'Bearer '+secret})};
 const response=await route.GET(request);assert.equal(response.status,200);assert.equal((await response.json()).uploadedBackupDeliveries,2);
 assert.deepEqual(calls,['database','backup','supplier','digiseller']);
 calls.length=0;failBackup=true;
 const failed=await route.GET(request);assert.equal(failed.status,503);assert.deepEqual(calls,['database','backup']);
 assert(!(await failed.text()).includes('fixture database failure'));
});

test('activation explains the actual configuration failure without exposing raw database details',async()=>{
 for(const [message,expected] of [
  ['Restore the imported customer fields first',/customer fields no longer match/],
  ['Start the FKWallet delivery worker first',/worker has not checked in/],
  ['Resolve existing supplier orders first',/outstanding supplier orders/],
  ['internal database detail secret',/Refresh and try again/],
 ]){
  let synced=false;
  const db={from(table){const q={select(){return q},eq(){return q},single(){return q},then(resolve){return Promise.resolve(resolve({data:table==='fkwallet_imports'?{connection_id:api.connectionId(creds),supplier_category_id:2}:[{supplier_product_id:9,supplier_cost:1108,supplier_currency:'RUB'}]}))}};return q},rpc:async()=>({error:{code:'P0001',message}})};
  const actions=load('app/admin/fkwallet/delivery-actions.ts',{
   'next/cache':{revalidatePath(){}},'@/lib/fkwallet-admin':{requireFKAdmin:async()=>({db})},
   '@/lib/fkwallet-api':{...api,fkRequest:async()=>[{...product,name_en:'Telegram'}]},
   '@/lib/fkwallet-fulfillment':{fkDeliveryEnabled:()=>true,createFKStockReader:()=>({}),syncFKProductStock:async()=>{synced=true}},
   '@/lib/fkwallet-import':imports,'@/lib/fkwallet-storage':{requireCredentials:async()=>creds},
  });
  const result=await actions.configureFKDelivery('84c8e8cd-7753-4cbc-b9c6-844f51e48779',true,'ACCOUNT');
  assert.match(result.error,expected);assert(!result.error.includes('secret'));assert.equal(synced,true);
 }
});
