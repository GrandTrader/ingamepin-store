const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={}) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports,Buffer,process:{env:{}},require:name=>{if(name in mocks)return mocks[name];if(name==='node:crypto')return require(name);throw Error('Unexpected dependency: '+name);}
 },{filename:file});return exports;
}
const helper=load('lib/digiseller-customer-information.ts');
const appleValues=[2,3,4,5,10,15,20,25,30,40,50,60,100,150,200,250,300,400,500];
const rows=appleValues.map((denomination,index)=>({id:'apple-'+denomination,product_id:'apple',digiseller_product_id:6203684,digiseller_option_id:6600439,digiseller_variant_id:34383429+index,denomination,is_active:true,available:40+index}));
const formats=row=>[
 {id:row.digiseller_option_id,user_data:row.digiseller_variant_id},
 {id:String(row.digiseller_option_id),user_data:String(row.digiseller_variant_id)},
 {id:row.digiseller_option_id,user_data_id:row.digiseller_variant_id},
 {id:String(row.digiseller_option_id),user_data_id:String(row.digiseller_variant_id)}
];
function fixture(options=rows,source='DEFINITEPLAY') {
 const reads=[],stockReads=[];
 const db={from(table){reads.push(table);const filters=[];let fields='';
  const result=()=>{
   if(table==='products')return {data:{stock_source:source}};
   if(table==='product_options')return {data:options.filter(row=>filters.every(fn=>fn(row))).map(row=>Object.fromEntries(fields.split(',').map(f=>[f.trim(),row[f.trim()]])))};
   if(table==='gift_card_codes'){
    const selected=options.filter(row=>filters.every(fn=>fn({product_option_id:row.id,status:'AVAILABLE'})));
    assert.equal(selected.length,1);stockReads.push(selected[0].id);return {count:selected[0].available};
   }
   throw Error('Unexpected table: '+table);
  };
  const q={select(value){fields=value;return q;},eq(key,value){filters.push(row=>row[key]===value);return q;},single:async()=>result(),then(resolve,reject){return Promise.resolve(result()).then(resolve,reject);}};return q;
 },async rpc(name,args){assert(['digiseller_supplier_available','digiseller_fkwallet_available'].includes(name),'Quantity checks must never queue a purchase');stockReads.push(args.p_option_id);return {data:options.find(row=>row.id===args.p_option_id)?.available??0};}};
 const route=load('app/api/digiseller/supplier/route.ts',{
  'next/server':{NextResponse:{json:body=>body}},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/digiseller-customer-information':helper,
  '@/lib/digiseller-api':{getDigiSellerPurchaseSelection:async()=>{throw Error('Quantity check must not access a paid invoice');}},
  '@/lib/digiseller-fkwallet-fulfillment':{readDigiFKJob:async()=>{throw Error('Quantity check must not access fulfillment jobs');},queueDigiFKPurchase:async()=>{throw Error('Quantity check must not purchase');}}
 });
 return {reads,stockReads,post:(options,productId=6203684)=>route.POST({json:async()=>({product_id:productId,count:2,...(options===undefined?{}:{options})})})};
}

test('Every Apple USA denomination resolves callback and purchase-ID formats for all stock sources',async()=>{
 for(const source of ['DEFINITEPLAY','FKWALLET','OWNED']){
  const f=fixture(rows,source);
  for(const row of rows)for(const selection of formats(row)){
   const response=await f.post([selection,{id:999999,user_data:String(row.digiseller_variant_id)}]);
   assert.equal(response.count,row.available,source+' '+row.denomination+' '+JSON.stringify(selection));
   assert.equal(f.stockReads.at(-1),row.id);
  }
 }
});

test('Subscriptions with identical face values still resolve by their distinct variants',async()=>{
 const premium=[3,6,12].map((months,index)=>({...rows[0],id:'premium-'+months,product_id:'premium',digiseller_product_id:6257589,digiseller_option_id:6855606,digiseller_variant_id:37147687+index,denomination:1,available:20+index}));
 const f=fixture([...rows,...premium],'FKWALLET');
 for(const row of premium){
  const selections=[formats(row)[0],{id:6856923,user_data:'@customer'}];
  assert.equal((await f.post(selections,6257589)).count,row.available);assert.equal(f.stockReads.at(-1),row.id);
 }
 assert.equal((await f.post([formats(rows[0])[0]],6257589)).count,0,'A different listing cannot supply the denomination');
});

test('Stock callbacks never confuse a variant ID with another denomination face value',()=>{
 const collision=[{...rows[0],id:'large',denomination:100,digiseller_variant_id:2},{...rows[0],id:'small',denomination:2,digiseller_variant_id:3}];
 assert.equal(helper.resolveDigiSelection(collision,[{id:6600439,user_data:2}],'quantity').id,'large');
 assert.equal(helper.resolveDigiSelection(collision,[{id:6600439,user_data:'2'}]).id,'small','Legacy verified-purchase denomination format is preserved');
 assert.equal(helper.resolveDigiSelection(collision,[{id:6600439,user_data_id:3,user_data:'100'}]).id,'small','Explicit verified variant ID takes precedence');
});

test('Invalid, missing, ambiguous, or customer-only selections fail closed instead of returning product-wide stock',async()=>{
 const invalid=[
  [{id:6600439,user_data:2}], [{id:6600439,user_data:999999}], [{id:6600439,user_data:'not-a-selection'}],
  [{id:999999,user_data:34383429}], [{id:999999,user_data_id:34383429}],
  [formats(rows[0])[0],formats(rows[0])[0]], [{id:6600439,user_data_id:999999,user_data:34383429}],
  [{id:6600439,user_data:true}], [{id:6600439,user_data:[34383429]}], [{id:6600439,user_data:'34383429.1'}],
  [{id:6600439,user_data:'3.4383429e7'}], [{id:6600439,user_data:0}], [{id:6600439,user_data:-1}],
  [{id:6600439,user_data:'9007199254740993'}], [null], [[]]
 ];
 const f=fixture();
 for(const selections of invalid)assert.equal((await f.post(selections)).count,0,JSON.stringify(selections));
 assert.equal(f.stockReads.length,0);
 const duplicate=fixture([rows[0],{...rows[0],id:'duplicate'}]);assert.equal((await duplicate.post([formats(rows[0])[0]])).count,0);assert.equal(duplicate.stockReads.length,0);
});

test('No-selection and single-option product compatibility is preserved; genuine zero stock stays zero',async()=>{
 const f=fixture();assert.equal((await f.post(undefined)).count,40);assert.equal((await f.post([])).count,40);
 const single={...rows[0],digiseller_option_id:null,digiseller_variant_id:null};
 assert.equal((await fixture([single]).post([{id:500,user_data:'customer-account'}])).count,40);
 assert.equal((await fixture([{...rows[0],available:0}]).post([formats(rows[0])[0]])).count,0);
});

test('Strict variant matching does not modify customer information or verified purchase selection',()=>{
 const selections=[formats(rows[0])[0],{id:101,user_data:'0012345'},{id:102,user_data:'0123'}];
 const original=JSON.stringify(selections);
 assert.equal(helper.resolveDigiSelection(rows,selections,'quantity').id,'apple-2');
 const fields=[{fieldId:'user',optionId:101,fieldType:'TEXT'},{fieldId:'server',optionId:102,fieldType:'NUMBER'}];
 assert.deepEqual(JSON.parse(JSON.stringify(helper.digiRecipientInformation(fields,selections))),[{fieldId:'server',value:'0123'},{fieldId:'user',value:'0012345'}]);
 assert.equal(JSON.stringify(selections),original);
 assert.equal(helper.resolveDigiSelection(rows,[{id:6600439,user_data_id:34383429,user_data:'2 USD'}]).id,'apple-2');
});
