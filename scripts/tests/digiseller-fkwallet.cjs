const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const clone=value=>JSON.parse(JSON.stringify(value));
function load(file,deps={},globals={}) {
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports,require:n=>n==='server-only'?{}:n in deps?deps[n]:n.startsWith('node:')?require(n):(()=>{throw Error(n)})(),Buffer,AbortSignal,Date,process,...globals});return exports;
}
const helpers=load('lib/digiseller-customer-information.ts');
const fields=[{fieldId:'user',optionId:101,fieldType:'TEXT'},{fieldId:'server',optionId:102,fieldType:'NUMBER'}];
const selections=[{id:99,user_data_id:9001},{id:101,user_data:'00123456789'},{id:102,user_data:'0123'}];
const mapped=[{id:'option',product_id:'product',digiseller_option_id:99,digiseller_variant_id:9001,denomination:1}];
const purchase={productId:100,invoiceState:3,quantity:1,amount:15,amountUsd:15,profit:14,options:selections};

test('denominations require their own parameter; numeric customer IDs cannot select a product',()=>{
 assert.equal(helpers.resolveDigiSelection(mapped,selections).id,'option');
 for(const options of [[{id:101,user_data:'1'}],[{id:101,user_data_id:9001}],[{id:99,user_data_id:9002}],[...selections,selections[0]]])assert.equal(helpers.resolveDigiSelection(mapped,options),null);
 assert.equal(helpers.resolveDigiSelection(mapped,[{id:99,user_data:'1'}]).id,'option');
 assert.equal(helpers.resolveDigiSelection([...mapped,...mapped],selections),null);
});
test('recipient validation preserves leading zeros and requires every unique text field',()=>{
 assert.deepEqual(clone(helpers.digiRecipientInformation(fields,selections)),[{fieldId:'server',value:'0123'},{fieldId:'user',value:'00123456789'}]);
 for(const options of [[],[...selections,selections[1]],selections.map(o=>o.id===101?{...o,user_data:123}:o),selections.map(o=>o.id===102?{...o,user_data:''}:o),selections.map(o=>o.id===102?{...o,user_data:'abc'}:o)])assert.throws(()=>helpers.digiRecipientInformation(fields,options));
 assert.throws(()=>helpers.digiRecipientInformation([fields[0],fields[0]],selections));
 assert.throws(()=>helpers.digiRecipientInformation([{fieldId:'email',optionId:101,fieldType:'EMAIL'}],selections));
 assert.throws(()=>helpers.digiRecipientInformation(fields,selections.map(o=>o.id===101?{...o,user_data:'bad\u0000value'}:o)));
});
test('unpaid/refunded invoices and unknown or invalid proceeds cannot purchase',()=>{
 assert.equal(helpers.digiNetProceeds(purchase),14);
 for(const change of [{invoiceState:1},{invoiceState:5},{profit:null},{profit:NaN},{profit:16},{profit:0},{amount:0},{amountUsd:Infinity},{quantity:1001},{quantity:1.5}])assert.throws(()=>helpers.digiNetProceeds({...purchase,...change}));
});

function syncFixture(options={}) {
 let config=null,next=1000;const calls=[],parameters=options.parameters??[];
 const websiteFields=options.fields??[{id:'user',label:'User ID',placeholder:'Enter your ID',field_type:'TEXT',is_required:true}];
 const db={from(table){const q={select(){return q},eq(){return q},not(){return q},order(){return q},maybeSingle(){return q},then(resolve){
  const data=table==='fkwallet_imports'?(options.notImported?null:{customer_fields:websiteFields.map(f=>({fieldId:f.id,fieldType:f.field_type}))}):table==='product_customer_fields'?websiteFields:table==='product_options'?[{digiseller_product_id:100}]:config;
  resolve({data,error:table==='digiseller_fkwallet_products'&&options.missingMigration?{code:'PGRST205'}:null});
 }};return q},async rpc(name,args){calls.push(['db',name,clone(args)]);if(args.p_ready===false)config={...config,ready:false};else config={ready:true,field_map:clone(args.p_fields)};return {data:null,error:null}}};
 const sync=load('lib/digiseller-field-sync.ts',{'./digiseller-api':{
  getDigiSellerToken:async()=>({token:'private-test-token'}),
  postDigiSeller:async(path,body)=>{calls.push(['post',path,clone(body)]);let p;if(body.option_id){p=parameters.find(p=>p.id===body.option_id);Object.assign(p,body)}else{p={...body,id:++next};parameters.push(p)}return {retval:0,content:{option_id:p.id}}},
 }},{fetch:async(url)=>{
  calls.push(['get',url.split('?')[0]]);
  if(url.includes('/list/'))return Response.json({retval:0,content:parameters});
  const id=Number(url.split('?')[0].split('/').pop());return Response.json({retval:0,content:{...parameters.find(p=>p.id===id),...(options.unconfirmed?{required:false}:{})}});
 }});
 return {calls,parameters,db,sync,config:()=>config};
}
test('sync creates required fields, verifies them and reuses them on later syncs',async()=>{
 const t=syncFixture({fields:[{id:'user',label:'User ID',field_type:'TEXT',is_required:true},{id:'server',label:'Server ID',field_type:'NUMBER',is_required:true},{id:'notes',label:'Details',field_type:'TEXTAREA',is_required:true}]});
 assert.equal(await t.sync.syncDigiSellerRecipientFields(t.db,'product'),1);
 assert.deepEqual(t.parameters.map(p=>[p.type,p.required]),[['text',true],['text',true],['textarea',true]]);
 assert.equal(t.config().ready,true);assert.equal(t.config().field_map.length,3);
 await t.sync.syncDigiSellerRecipientFields(t.db,'product');assert.equal(t.parameters.length,3);
 assert.equal(t.calls.filter(c=>c[0]==='post'&&c[1]==='/api/products/options').length,3);
 assert.equal(t.calls.filter(c=>c[0]==='post'&&c[1].endsWith('/update')).length,3);
});
test('migration, ambiguous fields or unconfirmed required inputs keep ordering closed',async()=>{
 const missing=syncFixture({missingMigration:true});await assert.rejects(missing.sync.syncDigiSellerRecipientFields(missing.db,'product'),/database update/);assert.equal(missing.calls.length,0);
 const ambiguous=syncFixture({parameters:[{id:1,type:'text',name:[{value:'User ID'}]},{id:2,type:'text',name:[{value:'User ID'}]}]});await assert.rejects(ambiguous.sync.syncDigiSellerRecipientFields(ambiguous.db,'product'),/ambiguous/);assert.equal(ambiguous.config().ready,false);assert(!ambiguous.calls.some(c=>c[0]==='post'));
 const unconfirmed=syncFixture({unconfirmed:true});await assert.rejects(unconfirmed.sync.syncDigiSellerRecipientFields(unconfirmed.db,'product'),/not confirmed/);assert.equal(unconfirmed.config().ready,false);
 const unsupported=syncFixture({notImported:true});await assert.rejects(unsupported.sync.syncDigiSellerRecipientFields(unsupported.db,'product'),/supported supplier/);assert.equal(unsupported.calls.length,0);
});
test('a completed remote create with lost local mapping is recovered by its unique label',async()=>{
 const t=syncFixture({parameters:[{id:10,type:'text',name:[{value:'User ID'}],required:false}]});
 await t.sync.syncDigiSellerRecipientFields(t.db,'product');assert.equal(t.parameters.length,1);assert.equal(t.config().field_map[0].optionId,10);
});

const api=load('lib/fkwallet-api.ts'),imports=load('lib/fkwallet-import.ts');
const credentials={publicKey:'test-public',privateKey:'test-private'};
function deliveryFixture(options={}) {
 const calls=[],unit={ordinal:1,request_key:'igpdsfk-123-1',submitted_at:null,provider_id:null,provider_status:null,result_ciphertext:null,...options.unit};
 const job={invoice_id:123,digiseller_product_id:100,option_id:'option',item_id:'digiseller-123',quantity:1,lease_token:'lease',created_at:new Date().toISOString(),supplier_payload:{connectionId:api.connectionId(credentials),categoryId:59,productId:215,supplierCost:880,currency:'RUB',exchangeRate:88,deliveryKind:'ACCOUNT',digiFieldMap:fields,digiOptionId:99,digiVariantId:9001,fieldMap:[{key:'Input1',fieldId:'user',fieldType:'TEXT'},{key:'Input2',fieldId:'server',fieldType:'NUMBER'}],customerInformation:clone(helpers.digiRecipientInformation(fields,selections))}};
 const db={from(){const q={select(){return q},eq(){return q},order:async()=>({data:[clone(unit)]})};return q},async rpc(name,args){calls.push(['db',name,args]);
  if(name==='claim_digiseller_fkwallet_job')return {data:clone(job)};
  if(name==='mark_digiseller_fkwallet_unit'){if(unit.submitted_at)throw Error('already submitted');unit.submitted_at=new Date().toISOString()}
  if(name==='record_digiseller_fkwallet_unit'){unit.provider_id=args.p_provider_id;unit.provider_status=args.p_status;unit.result_ciphertext=args.p_result}
  return {data:null};
 }};
 const core=load('lib/fkwallet-fulfillment.ts',{'@/lib/supabase/admin':{},'./fkwallet-import':imports,'./fkwallet-storage':{seal:JSON.stringify,unseal:JSON.parse},'./fkwallet-api':{...api,
  fkRequest:async(c,path,body)=>{calls.push(['api',path,body]);
   if(path.endsWith('/products'))return [{id:215,name_en:'ML',price:880,currency:'RUB',price_type:'FIXED',fields:[{key:'Input1',type:'text',label:'User ID'},{key:'Input2',type:'number',label:'Server ID'}]}];
   if(path==='currencies')return [{id:1,code:'RUB'}];if(path==='balance')return [{currency_code:'RUB',value:8800}];
   if(path==='op/validate')return null;if(path==='op/create'){if(options.timeout)throw new api.FKError('timeout');return {id:42,status:1}};
   if(path==='op/status/42')return {id:42,status:1};throw Error(path);
  },findFKOrderHistory:async()=>options.history??{id:'42',status:'success',amount:880,currency:'RUB'}
 }});
 const worker=load('lib/digiseller-fkwallet-fulfillment.ts',{'./supabase/admin':{},'./digiseller-customer-information':helpers,'./fkwallet-fulfillment':{...core,fkDeliveryEnabled:()=>true},'./fkwallet-storage':{requireCredentials:async()=>credentials},'./digiseller-api':{getDigiSellerPurchaseSelection:async()=>{calls.push(['verify']);if(options.verificationFails)throw Error('network');return {...purchase,...options.purchase}}}});
 return {calls,job,unit,worker,run:()=>worker.runDigiFKDeliveryTick(db)};
}
test('DigiSeller delivery verifies payment, forwards recipient values, and completes only after supplier confirmation',async()=>{
 const t=deliveryFixture();assert.equal((await t.run()).state,'submitted');
 const create=t.calls.find(c=>c[1]==='op/create');assert(create);assert.deepEqual(clone(create[2].fields),[{key:'Input1',value:'00123456789'},{key:'Input2',value:'0123'}]);
 assert(t.calls.findIndex(c=>c[0]==='verify')<t.calls.findIndex(c=>c[1]==='mark_digiseller_fkwallet_unit'));
 assert(t.calls.findIndex(c=>c[1]==='mark_digiseller_fkwallet_unit')<t.calls.indexOf(create));
 assert(!t.calls.some(c=>c[1]==='complete_digiseller_fkwallet_job'));
 assert.equal((await t.run()).state,'delivered');assert.equal(t.calls.filter(c=>c[1]==='op/create').length,1);
 assert.deepEqual(clone(t.calls.find(c=>c[1]==='complete_digiseller_fkwallet_job')[2].p_codes),[]);
});
test('refunds, edited recipients and failed payment checks cannot start supplier purchases',async()=>{
 for(const options of [{verificationFails:true},{purchase:{invoiceState:5}},{purchase:{options:selections.map(o=>o.id===101?{...o,user_data:'different'}:o)}},{purchase:{quantity:2}},{purchase:{productId:999}}]){
  const t=deliveryFixture(options);await t.run();assert(!t.calls.some(c=>c[0]==='api'));assert(!t.calls.some(c=>c[1]==='complete_digiseller_fkwallet_job'));
 }
});
test('timeouts and unknown supplier status never duplicate a purchase or claim delivery',async()=>{
 const timed=deliveryFixture({timeout:true});await timed.run();await timed.run();assert.equal(timed.calls.filter(c=>c[1]==='op/create').length,1);assert(!timed.calls.some(c=>c[1]==='complete_digiseller_fkwallet_job'));
 const pending=deliveryFixture({history:{id:'42',status:'unknown',amount:880,currency:'RUB'},unit:{submitted_at:new Date().toISOString(),provider_id:'42'}});await pending.run();assert(!pending.calls.some(c=>c[1]==='op/create'||c[1]==='complete_digiseller_fkwallet_job'));
});

test('admin field synchronization rejects unauthenticated users before external access',async()=>{
 let writes=0;const actions=load('app/admin/products/[id]/edit/stock/digiseller-actions.ts',{'next/cache':{},'next/navigation':{redirect:()=>{throw Error('login required')}},'@/lib/supabase/admin':{createAdminClient:()=>{writes++}},'@/lib/supabase/admin-session':{createClient:async()=>({auth:{getUser:async()=>({data:{user:null}})}})},'@/lib/digiseller-api':{},'@/lib/digiseller-field-sync':{syncDigiSellerRecipientFields:async()=>{writes++}}});
 for(const action of [()=>actions.loadDigiSellerMappingProducts(),()=>actions.syncDigiSellerCustomerFields('product'),()=>actions.saveDigiSellerMapping('product',new FormData()),()=>actions.createDigiSellerProduct('product',new FormData())])await assert.rejects(action(),/login required/);
 assert.equal(writes,0);
});

test('price and denomination sync preserve recipient inputs even when they precede the selector',()=>{
 const pricing=load('lib/digiseller-pricing.ts');
 const priceApi=load('lib/digiseller-price-api.ts',{'./digiseller-api':{},'./digiseller-pricing':pricing});
 const recipients=[{id:101,type:'text',required:true,variants:[]},{id:102,type:'textarea',required:true,variants:[]}];
 const snapshot={id:100,base:15,currency:'USD',enabled:true,parameters:[...recipients,{id:99,type:'radio',required:true,variants:[{variant_id:9001,name:[{locale:'en-US',value:'3 months'}],type:'priceplus',rate:0,is_default:true,visible:true,order:1}]}]};
 const options=[{id:'option',name:'3 months',price:15,productId:100,optionId:99,variantId:9001}];
 const plan=pricing.buildPricePlan(options,[snapshot],'10');assert.equal(plan.rows[0].next,16.5);
 const targets=priceApi.targetPriceSnapshots(plan);assert.deepEqual(clone(targets[0].parameters.slice(0,2)),recipients);
 const denominations=pricing.buildDenominationPlan([...options,{id:'new',name:'6 months',price:25,productId:null,optionId:null,variantId:null}],snapshot,'10');
 assert.equal(denominations.rows[1].optionId,99);assert.equal(denominations.rows[1].change,'Add');
 assert.throws(()=>pricing.buildPricePlan(options,[{...snapshot,parameters:[...snapshot.parameters,{id:103,type:'select',required:true,variants:[]}]}],'10'),/additional price parameters/);
});

test('Telegram plans sharing value 1 are matched by exact plan name; invalid and duplicate selections do not save',async()=>{
 const options=[3,6,12].map(months=>({id:'option-'+months,option_name:'Telegram Premium for '+months+' months',denomination:1}));
 const variants=options.map((option,i)=>({name:option.option_name,optionId:99,variantId:9001+i}));
 const writes=[];let syncs=0;
 const db={from(){let change=null;const q={select(){return q},eq(){return q},update(value){change=value;return q},then(resolve){if(change)writes.push(change);resolve({data:change?null:options})}};return q}};
 const session={auth:{getUser:async()=>({data:{user:{id:'admin'}}})},from(){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:{user_id:'admin'}})}}};
 const actions=load('app/admin/products/[id]/edit/stock/digiseller-actions.ts',{'next/cache':{revalidatePath(){}},'next/navigation':{redirect:url=>{throw Error(url)}},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/supabase/admin-session':{createClient:async()=>session},'@/lib/digiseller-api':{listDigiSellerVariants:async()=>variants},'@/lib/digiseller-field-sync':{getDigiSellerRecipientFields:async()=>[],syncDigiSellerRecipientFields:async()=>{syncs++}}});
 const form=new FormData();for(const option of options)form.set('digiseller_'+option.id,'100');
 await assert.rejects(actions.saveDigiSellerMapping('product',form),/success=/);assert.deepEqual(writes.map(w=>w.digiseller_variant_id),[9001,9002,9003]);assert.equal(syncs,1);
 writes.length=0;form.set('digiseller_variant_option-6','99:9001');await assert.rejects(actions.saveDigiSellerMapping('product',form),/Each%20website%20option/);assert.equal(writes.length,0);
 form.set('digiseller_variant_option-6','101:9002');await assert.rejects(actions.saveDigiSellerMapping('product',form),/valid%20DigiSeller/);assert.equal(writes.length,0);
});
