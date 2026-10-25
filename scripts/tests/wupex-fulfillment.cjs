const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const clone=x=>JSON.parse(JSON.stringify(x));
function load(file,mocks={},globals={}) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports,require:n=>n==='server-only'?{}:n in mocks?mocks[n]:require(n),Buffer,URL,AbortSignal,Date,process,...globals
 }); return exports;
}
const credentials={baseUrl:'https://live-fixture.wupex.com',apiKey:'fixture-only-key',merchantCode:'fixture-merchant'};
const api=load('lib/wupex-api.ts');
const storage=load('lib/wupex-storage.ts',{'@/lib/supabase/admin':{},'./wupex-api':api},{process:{env:{WUPEX_ENCRYPTION_KEY:'x'.repeat(40)}}});
const product={id:101,name:'Apple 4 USD',sku:'APPLE4',price:4.1,available:250,cardType:'voucher',subType:null,region:'USA',faceValue:4};
const payload={connectionId:api.wupexConnectionId(credentials),productId:101,productName:product.name,sku:product.sku,cardType:'voucher',subType:null,supplierCost:4.1,currency:'USD',exchangeRate:1,deliveryKind:'CODE',fieldMap:[],customerInformation:[]};
const baseOrder={orderName:'X123',reference:'igpwx-fixture-1',status:'COMPLETED',amount:4.1,total:1,delivered:1,remaining:0,codes:[{sku:'APPLE4',code:'TEST-CODE-NO-VALUE'}],skus:['APPLE4']};
function fixture(options={}) {
 const calls=[],records=[{ordinal:1,request_key:'igpwx-fixture-1',submitted_at:options.submitted?new Date().toISOString():null,provider_id:options.providerId??null,provider_status:null,result_ciphertext:null}];
 const module=load('lib/wupex-fulfillment.ts',{'@/lib/supabase/admin':{},'./wupex-api':{
  ...api,findWupexProducts:async()=>{calls.push('catalog');return[options.product??product]},
  getWupexBalance:async()=>({amount:options.balance??100,currency:'USD'}),
  getWupexFields:async()=>options.fields??[],
  getWupexServers:async()=>[{id:'s1',name:'Server 1'}],
  submitWupexUnit:async()=>{calls.push('post');assert(records[0].submitted_at,'intent saved before spending');if(options.failPost)throw new api.WupexError('Wupex could not be reached or returned an invalid response.');return{orderName:'X123'}},
  getWupexOrder:async(c,lookup)=>{calls.push({lookup});return options.order??baseOrder},
 },'./wupex-storage':storage});
 const job={item_id:'fixture-item',order_id:'fixture-order',lease_token:'fixture-lease',quantity:1,supplier_payload:options.payload??payload};
 const store={
  units:async()=>records,
  mark:async(n,request)=>{calls.push('mark');if(options.failMark)throw Error('database failure');records[0].submitted_at=new Date().toISOString();assert(!request.includes('APPLE4'))},
  record:async(n,id,status,amount,result)=>{calls.push('record:'+status);Object.assign(records[0],{provider_id:id,provider_status:status,result_ciphertext:result});},
  hold:async(state,issue)=>calls.push({state,issue}),
  complete:async codes=>calls.push({complete:clone(codes)}),
 };
 return {module,job,store,calls,records,run:()=>module.processWupexPurchase(credentials,job,store)};
}
test('Paid queue unit stores encrypted intent, confirms detail and completes exact code',async()=>{
 const f=fixture();assert.equal(await f.run(),'delivered');assert.deepEqual(f.calls.filter(x=>typeof x==='string'),['catalog','mark','post','record:unknown','record:success']);assert(f.calls.some(x=>x.complete?.[0]==='TEST-CODE-NO-VALUE'));
 assert(!f.records[0].result_ciphertext.includes('TEST-CODE'));assert.throws(()=>storage.unsealWupex(f.records[0].result_ciphertext,'other-order'));
});
test('Lost voucher POST response is recovered by reference without a second purchase',async()=>{
 const f=fixture({failPost:true});assert.equal(await f.run(),'waiting');assert.equal(await f.run(),'delivered');assert.equal(f.calls.filter(x=>x==='post').length,1);assert(f.calls.some(x=>x.lookup?.referenceId==='igpwx-fixture-1'));
});
test('Lost top-up response never re-submits automatically',async()=>{
 const top={...payload,cardType:'topup',subType:1,deliveryKind:'ACCOUNT',fieldMap:[{key:'userId',fieldId:'user-field',fieldType:'TEXT'}],customerInformation:[{fieldId:'user-field',value:'player123'}]};
 const f=fixture({payload:top,product:{...product,cardType:'topup',subType:1},fields:[{key:'userId',fieldType:'TEXT'}],failPost:true});
 assert.equal(await f.run(),'review');assert.equal(await f.run(),'review');assert.equal(f.calls.filter(x=>x==='post').length,1);assert.equal(f.calls.filter(x=>x.lookup).length,0);
});
test('Unknown stock, insufficient balance, changed SKU/cost/account and failed durable save cannot spend',async()=>{
 for(const options of [{product:{...product,available:null}},{product:{...product,available:0}},{balance:1},{product:{...product,sku:'OTHER'}},{product:{...product,price:10}},{payload:{...payload,connectionId:'wrong'}},{failMark:true}]){
  const f=fixture(options);await f.run();assert(!f.calls.includes('post'));assert(!f.calls.some(x=>x.complete));
 }
 const f=fixture();await assert.rejects(f.module.processWupexPurchase({...credentials,baseUrl:api.WUPEX_SANDBOX_URL},f.job,f.store),/Sandbox/);assert.equal(f.calls.length,0);
});
test('Wrong denomination, charge, quantity and partial delivery cannot be completed',async()=>{
 for(const order of [{...baseOrder,skus:['OTHER']},{...baseOrder,reference:'wrong'},{...baseOrder,total:2},{...baseOrder,amount:5},{...baseOrder,codes:[]},{...baseOrder,status:'FAILED'},{...baseOrder,status:'PROCESSING',delivered:0,remaining:1,codes:[],skus:[]}]){
  const f=fixture({submitted:true,providerId:'X123',order});await f.run();assert(!f.calls.includes('post'));assert(!f.calls.some(x=>x.complete));
 }
});
test('Top-up completion produces no invented voucher; recipient IDs and servers are validated',async()=>{
 const top={...payload,cardType:'topup',subType:2,deliveryKind:'ACCOUNT',fieldMap:[{key:'userId',fieldId:'u',fieldType:'TEXT'},{key:'serverId',fieldId:'s',fieldType:'TEXT'}],customerInformation:[{fieldId:'u',value:'player1'},{fieldId:'s',value:'s1'}]};
 const options={payload:top,product:{...product,cardType:'topup',subType:2},fields:[{key:'userId',fieldType:'TEXT'},{key:'serverId',fieldType:'TEXT'}],order:{...baseOrder,codes:[]}};
 const f=fixture(options);assert.equal(await f.run(),'delivered');assert(f.calls.some(x=>x.complete&&x.complete.length===0));
 const bad=fixture({...options,payload:{...top,customerInformation:[{fieldId:'u',value:'player1'},{fieldId:'s',value:'wrong'}]}});await bad.run();assert(!bad.calls.includes('post'));
});
test('Documented helpers and voucher POST encode parameters and never follow redirects',async()=>{
 const calls=[];
 const a=load('lib/wupex-api.ts',{}, {fetch:async(url,options)=>{
  calls.push({url,options});return Response.json({status:true,data:url.includes('listservers')?[{serverId:'s1',name:'Server 1'}]:url.includes('/attribute')?[{attribute_id:1,name:'Level',required:true},{attribute_id:2,name:'Region',required:false}]:{orderName:'X123'}});
 }});
 const fields=await a.getWupexFields(credentials,{...product,cardType:'topup',subType:5});assert.deepEqual(clone(fields.map(f=>f.key)),['attribute_1']);
 await a.getWupexServers(credentials,'SKU / value');await a.submitWupexUnit(credentials,'APPLE4','unique-reference',null);
 await a.submitWupexUnit(credentials,'GAME','unique-reference-2',{userAccount:{userId:'player1'}});
 assert.equal(calls[1].options.method,'POST');assert.equal(calls[1].options.body,undefined);assert(calls[1].url.includes('SKU%20%2F%20value'));
 assert(calls[2].url.endsWith('referenceId=unique-reference&allowTakeAll=false'));assert.deepEqual(JSON.parse(calls[2].options.body),[{merchant:credentials.merchantCode,sku:'APPLE4',quantity:1}]);
 assert(!calls[3].url.includes('referenceId'),'Do not invent top-up idempotency support');assert(calls.every(c=>c.options.redirect==='error'));
});
test('Import markup uses decimal arithmetic and rejects price overrides',()=>{
 const fk=load('lib/fkwallet-import.ts'),imp=load('lib/wupex-import.ts',{'./fkwallet-import':fk});
 const input={requestId:'11111111-1111-4111-8111-111111111111',categoryId:'22222222-2222-4222-8222-222222222222',connectionId:payload.connectionId,query:'Apple',title:'Apple USA',titleRu:'',description:'',descriptionRu:'',region:'USA',markup:'10',exchangeRate:'1',options:[{id:101,expectedCost:'4.1',expectedCurrency:'USD',name:'4 USD',denomination:'4',currency:'USD',optionType:'CURRENCY'}]};
 const draft=imp.prepareWupexDraft(input,[{...product,fields:[]}],'USD');assert.equal(draft.options[0].price,'4.51');assert.equal(draft.options[0].supplierSnapshot.sku,'APPLE4');
 assert.throws(()=>imp.prepareWupexDraft({...input,options:[{...input.options[0],price:'1'}]},[{...product,fields:[]}],'USD'));
 assert.throws(()=>imp.prepareWupexDraft(input,[{...product,fields:[]}],'RUB'));assert.throws(()=>imp.prepareWupexDraft(input,[{...product,price:5,fields:[]}],'USD'));
});

test('Every Wupex mutation and import read authenticates before touching the provider',async()=>{
 const denied=async()=>{throw Error('admin required')};
 const common={'next/cache':{},'@/lib/wupex-admin':{requireWupexAdmin:denied},'@/lib/wupex-api':api,'@/lib/wupex-storage':{},'@/lib/wupex-import':{},'@/lib/wupex-fulfillment':{}};
 for(const [file,names] of [
  ['app/admin/wupex/import-actions.ts',['loadWupexImport','importWupexProduct','listWupexImports']],
  ['app/admin/wupex/delivery-actions.ts',['configureWupexDelivery','saveWupexMarkup','refreshWupexProduct']],
 ]) {const actions=load(file,common);for(const name of names)await assert.rejects(actions[name](),/admin required/);}
});
test('Scheduler refuses wrong bearer tokens before invoking the delivery worker',async()=>{
 let calls=0;
 const route=load('app/api/cron/wupex/route.ts',{'next/server':{NextResponse:{json:(body,init)=>({body,...init})}},'@/lib/wupex-fulfillment':{runWupexDeliveryTick:async()=>{calls++;return{stockFailed:0}}}},{process:{env:{CRON_SECRET:'fixture-secret-'.repeat(3)}}});
 for(const token of ['', 'wrong'])assert.equal((await route.GET({headers:new Headers({authorization:token})})).status,401);
 assert.equal(calls,0);
 assert.equal((await route.GET({headers:new Headers({authorization:'Bearer '+'fixture-secret-'.repeat(3)})})).status,200);assert.equal(calls,1);
});
test('Supplier price increases refresh cost facts and retain funded stock; failed reads close stock',async()=>{
 const calls=[];
 const db={from(table){const q={select(){return q},eq(){return q},single(){return q},then(resolve){resolve({data:table==='wupex_imports'?{connection_id:payload.connectionId,customer_fields:[]}:[{option_id:'option-1',supplier_product_id:101,supplier_snapshot:product}],error:null})}};return q},rpc:async(name,args)=>{calls.push({name,args});return{data:1}}};
 const f=fixture();
 const reader={syncedAt:new Date().toISOString(),balance:async()=>({amount:55,currency:'USD'}),products:async()=>[{...product,price:5,available:8}]};
 await f.module.syncWupexProduct(db,credentials,'product-1',reader);
 assert.deepEqual(clone(calls[0].args.p_rows),[{optionId:'option-1',quantity:8,supplierId:'101',supplierCurrency:'USD',supplierCost:'5'}]);
 await assert.rejects(f.module.syncWupexProduct(db,credentials,'product-1',{...reader,products:async()=>{throw Error('network')}}));
 assert.deepEqual(clone(calls.at(-1).args.p_rows),[]);
});
