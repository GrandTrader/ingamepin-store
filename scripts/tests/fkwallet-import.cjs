const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='server-only'?{}:deps[n]??(n.startsWith('node:')?require(n):(()=>{throw Error(n)})()),Buffer,Date,Error,process,AbortSignal});return exports;}
const helper=load('lib/fkwallet-import.ts'),api=load('lib/fkwallet-api.ts');
const id='22222222-2222-4222-8222-222222222222',category='33333333-3333-4333-8333-333333333333';
const creds={publicKey:'test-public-key',privateKey:'test-private-key'},account=api.connectionId(creds);
const item={id:17,name:'Apple 500 RUB',price:624,currency:'RUB',fields:[],params:[],description:'',help:'',priceType:'FIXED',productType:'DEFAULT'};
const input=()=>({requestId:id,connectionId:account,supplierCategoryId:3,categoryId:category,title:'Apple Wallet — Russia',titleRu:'',description:'Description',descriptionRu:'',region:'Russia',markup:'10',exchangeRate:'83.76',options:[{id:17,name:item.name,expectedCost:'624',expectedCurrency:'RUB',denomination:'500',currency:'RUB',optionType:'CURRENCY'}]});
test('USD prices use the chosen exchange rate and markup, with one final rounding',()=>{
 assert.equal(helper.fkSellingPrice('624','83.76','10'),'8.19');
 assert.equal(helper.fkSellingPrice('49','49','5'),'1.05');
 assert.equal(helper.fkSellingPrice('1.005','1','0'),'1.01');
 assert.equal(helper.fkSellingPrice('123.45678901','2.5','12.34'),'55.48');
 for(const args of [['1','0','5'],['1','-1','5'],['1','NaN','5'],['1','1',''],['1','1','1001'],['0','1','5'],['1','1','5.001']])assert.throws(()=>helper.fkSellingPrice(...args));
});
test('fresh supplier costs are authoritative, manual prices survive markup, unsupported items fail closed',()=>{
 assert.equal(helper.prepareFKDraft(input(),[item]).options[0].price,'8.19');
 const manual=input();manual.options[0].price='7.99';assert.equal(helper.prepareFKDraft(manual,[item]).options[0].price,'7.99');
 for(const changed of [{...item,price:625},{...item,currency:'USD'},{...item,priceType:'PERCENT'},{...item,productType:'ESIM'},{...item,fields:[{key:'Input1'}]}])assert.throws(()=>helper.prepareFKDraft(input(),[changed]));
 assert.throws(()=>helper.prepareFKDraft({...input(),title:'<b></b>'},[item]));
 assert.throws(()=>helper.prepareFKDraft({...input(),options:[input().options[0],input().options[0]]},[item]));
 const usd={...item,currency:'USD'};const wrongRate=input();wrongRate.options[0].expectedCurrency='USD';assert.throws(()=>helper.prepareFKDraft(wrongRate,[usd]),/must be 1/);
 assert.equal(helper.fkPlainText('<script>alert(1)</script><div>A &amp; B<br>Code</div>'),'A & B\nCode');
});
test('explicit selection cannot expand to an entire catalogue',()=>{
 assert.equal(helper.parseFKSelection('1,17,500').join(','),'1,17,500');
 for(const v of ['',null,'1,1','0','-1','1,','1 OR 1=1',Array.from({length:51},(_,i)=>i+1).join(',')])assert.throws(()=>helper.parseFKSelection(v));
});
const telegramRaw=[3,6,12].map((months,index)=>({id:9+index,name_en:`Telegram Premium for ${months} months`,price:1108+index*500,currency:'RUB',price_type:'FIXED',product_type:'DEFAULT',fields:[{key:'Input1',label:'Username',placeholder:null,info:{placeholder:'@vanya777'},type:'text',required:false,values:null}]}));
const telegram=()=>api.parseProducts(telegramRaw);
const telegramInput=()=>({...input(),supplierCategoryId:2,title:'Telegram Premium',region:'Global',options:telegram().map(p=>({id:p.id,name:p.name,expectedCost:String(p.price),expectedCurrency:'RUB',denomination:'1',currency:'USD',optionType:'OTHER'}))});
test('all Telegram Premium plans preserve one required username and supplier field keys',()=>{
 const products=telegram();assert(products.every(p=>helper.fkImportIssue(p)===''));
 assert.equal(products[0].fields[0].label,'Username');assert.equal(products[0].fields[0].placeholder,'@vanya777');
 const draft=helper.prepareFKDraft(telegramInput(),products);
 assert.equal(draft.options.length,3);assert.equal(draft.customerFields.length,1);
 assert.deepEqual(JSON.parse(JSON.stringify(draft.customerFields[0])),{key:'Input1',label:'Username',placeholder:'@vanya777',fieldType:'TEXT',isRequired:true});
 assert.equal(draft.options[0].supplierSnapshot.fields[0].key,'Input1');
 for(const changed of [{type:'password'},{type:'select',values:['x']},{type:'text',hasChoices:true},{key:'invalid key'}]){
  const bad=telegram();Object.assign(bad[0].fields[0],changed);assert.throws(()=>helper.prepareFKDraft(telegramInput(),bad));
 }
 const different=telegram();different[1].fields[0].key='OtherRecipient';assert.throws(()=>helper.prepareFKDraft(telegramInput(),different),/different customer information/);
 const missing=telegram();missing[1].fields=[];assert.throws(()=>helper.prepareFKDraft(telegramInput(),missing),/different customer information/);
 const choices=api.parseProducts([{...telegramRaw[0],fields:[{...telegramRaw[0].fields[0],values:{one:'choice'}}]}]);assert.notEqual(helper.fkImportIssue(choices[0]),'');
});
function setup(options={}){
 const calls=[];const db={from(){calls.push('db-read');return {select(){return this},eq(){return this},limit:async()=>({data:[],error:options.fieldsMissing?{code:'42703'}:null}),maybeSingle:async()=>({data:options.previous??null,error:options.missing?{code:'PGRST205'}:null})}},rpc:async(name,args)=>{calls.push(['rpc',name,args]);return options.duplicate?{error:{code:'23505'}}:{data:{productId:id,replayed:false}}}};
 const actions=load('app/admin/fkwallet/import/actions.ts',{'next/cache':{revalidatePath(){}},'@/lib/fkwallet-admin':{requireFKAdmin:async()=>{calls.push('auth');if(options.denied)throw Error('denied');return {db,userId:'admin'}}},'@/lib/fkwallet-storage':{requireCredentials:async()=>creds},'@/lib/fkwallet-api':{...api,fkRequest:async(c,endpoint,body)=>{calls.push(['api',endpoint,body]);if(endpoint!==`op/categories/${options.telegram?2:3}/products`||body!==undefined)throw Error('Unexpected supplier purchase');return options.telegram?telegramRaw:[{...item,name_en:item.name,price:options.changed?625:624,price_type:'FIXED',product_type:'DEFAULT'}]}},'@/lib/fkwallet-import':helper});return {calls,actions};
}
test('manual import authenticates, checks the connection, and never purchases anything',async()=>{
 const denied=setup({denied:true});await assert.rejects(denied.actions.importFKProduct(input()),/denied/);assert.deepEqual(denied.calls,['auth']);
 const t=setup();const result=await t.actions.importFKProduct(input());assert.equal(result.productId,id);
 const rpc=t.calls.find(c=>c[0]==='rpc');assert.equal(rpc[1],'import_fkwallet_draft');assert.equal(rpc[2].p_draft.options[0].price,'8.19');
 const changed=setup({changed:true});assert.match((await changed.actions.importFKProduct(input())).error,/price changed/);assert(!changed.calls.some(c=>c[0]==='rpc'));
 const wrong=setup();assert.match((await wrong.actions.importFKProduct({...input(),connectionId:'wrong'})).error,/account changed/);assert(!wrong.calls.includes('db-read'));
});
test('lost responses recover the same draft even without a supplier call; missing setup and duplicate products are clear',async()=>{
 const t=setup({previous:{product_id:id,connection_id:account,imported_by:'admin'}});assert.equal((await t.actions.importFKProduct(input())).replayed,true);assert(!t.calls.some(c=>c[0]==='api'||c[0]==='rpc'));
 assert.match((await setup({missing:true}).actions.importFKProduct(input())).error,/database update/);
 assert.match((await setup({duplicate:true}).actions.importFKProduct(input())).error,/already been imported/);
});

test('Telegram import saves normalized recipient fields, and missing database support blocks writes',async()=>{
 const t=setup({telegram:true});const result=await t.actions.importFKProduct(telegramInput());assert.equal(result.productId,id);
 const rpc=t.calls.find(c=>c[0]==='rpc');assert.equal(rpc[2].p_draft.customerFields[0].label,'Username');assert.equal(rpc[2].p_draft.options.length,3);
 const missing=setup({telegram:true,fieldsMissing:true});assert.match((await missing.actions.importFKProduct(telegramInput())).error,/customer fields database update/);assert(!missing.calls.some(c=>c[0]==='rpc'));
});
