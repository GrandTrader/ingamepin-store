const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,imports={}){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(n=>n in imports?imports[n]:require(n),exports);return exports;}
(async()=>{
 const STOCK_ID=6258900,PRODUCT_ID='a0127452-de5d-422d-ac83-b811021e572a';
 const options=[1000,2000,3000,4000,5000].map((v,i)=>({id:'o'+i,product_id:PRODUCT_ID,denomination:v,is_active:true,is_in_stock:true,is_custom_value:false,digiseller_product_id:STOCK_ID,digiseller_option_id:90,digiseller_variant_id:100+i}));
 let counts=[0,0,0,11,8],dbError=false,locked=false,product={status:'ACTIVE',stock_source:'OWNED',delivery_type:'AUTOMATIC'},mapped=options;
 const db={from(table){const filters={};const q={select(){return q},eq(k,v){filters[k]=v;return q},order(){return q},single(){assert.equal(filters.id,PRODUCT_ID);return Promise.resolve({data:product,error:dbError?{}:null})},maybeSingle(){return Promise.resolve({data:{sync_token:locked?'busy':null},error:null})},then(resolve){if(table==='product_options'){assert.equal(filters.digiseller_product_id,STOCK_ID);return resolve({data:mapped,error:dbError?{}:null})}assert.equal(table,'gift_card_codes');assert.equal(filters.product_id,PRODUCT_ID);assert.equal(filters.status,'AVAILABLE');return resolve({count:counts[Number(filters.product_option_id.slice(1))],error:dbError?{}:null})}};return q}};
 const stock=load('lib/digiseller-playstation-stock.ts',{'server-only':{}});
 assert.deepEqual((await stock.playstationStock(db)).map(o=>o.available),counts);
 product.status='DRAFT';assert((await stock.playstationStock(db)).every(o=>o.available===0));product.status='ACTIVE';
 mapped=options.map((o,i)=>i===3?{...o,is_active:false}:o);assert.equal((await stock.playstationStock(db))[3].available,0);mapped=options;
 for(const change of [{stock_source:'FKWALLET'},{delivery_type:'MANUAL'}]){const before=product;product={...before,...change};await assert.rejects(stock.playstationStock(db));product=before;}
 mapped=[{...options[0],product_id:'other'}];await assert.rejects(stock.playstationStock(db));mapped=options;
 dbError=true;await assert.rejects(stock.playstationStock(db));dbError=false;

 let precheck={precheck_active:false,precheck_url:'',precheck_no_answer:'stop'},writes=[],fail=false;
 const variants=options.map((o,i)=>({variant_id:o.digiseller_variant_id,visible:true,is_default:i===0,order:i+1,name:[{locale:'en-US',value:o.denomination+' INR'}],type:'priceplus',rate:i*12}));
 let remote={id:90,type:'radio',required:true,variants:structuredClone(variants)};
 const realFetch=global.fetch;
 global.fetch=async(url,init)=>{const path=new URL(url).pathname;if(fail)throw Error('network unavailable');
   if(path===`/api/products/options/list/${STOCK_ID}`)return Response.json({retval:0,content:[{id:90,type:'radio'}]});
   if(path==='/api/products/options/90')return Response.json({retval:0,content:remote});
   if(path===`/api/products/options/precheck-settings/${STOCK_ID}`){if(init.method==='PUT'){const body=JSON.parse(init.body);writes.push({path,body});precheck={...precheck,...body};}return Response.json({retval:0,content:precheck});}
   const match=path.match(/^\/api\/products\/options\/90\/variants\/(\d+)$/);assert(match,path);
   const body=JSON.parse(init.body);assert.deepEqual(Object.keys(body).sort(),['default','visible']);writes.push({path,body});
   const v=remote.variants.find(v=>v.variant_id===Number(match[1]));if(body.default)remote.variants.forEach(v=>v.is_default=false);v.visible=body.visible;v.is_default=body.default;return Response.json({retval:0,content:{status:'Success'}});
 };
 const sync=load('lib/digiseller-playstation-stock-sync.ts',{'server-only':{},'./digiseller-api':{getDigiSellerToken:async()=>({token:'test'}),listDigiSellerProducts:async()=>[{id:STOCK_ID}]},'./supabase/admin':{createAdminClient:()=>db},'./digiseller-playstation-stock':stock});
 try{
   const first=await sync.syncPlaystationDigiSellerStock();assert.equal(first.changed,4);assert.deepEqual(remote.variants.map(v=>v.visible),[false,false,false,true,true]);assert.equal(remote.variants.find(v=>v.is_default).variant_id,103);assert.equal(precheck.precheck_active,true);assert.equal(precheck.precheck_no_answer,'stop');
   assert.deepEqual(remote.variants.map(({visible,is_default,...v})=>v),variants.map(({visible,is_default,...v})=>v),'price modifiers, names and ordering preserved');
   writes=[];assert.equal((await sync.syncPlaystationDigiSellerStock()).changed,0);assert.equal(writes.length,0,'unchanged stock causes no writes');
   counts[0]=2;await sync.syncPlaystationDigiSellerStock();assert.equal(remote.variants[0].visible,true,'restocked option returns');
   counts=[0,0,0,0,0];await sync.syncPlaystationDigiSellerStock();assert(remote.variants.every(v=>!v.visible&&!v.is_default),'all sold out');
   counts[2]=1;await sync.syncPlaystationDigiSellerStock();assert.equal(remote.variants[2].is_default,true,'restock after complete sellout');
   writes=[];locked=true;assert.equal((await sync.syncPlaystationDigiSellerStock()).skipped,true);assert.equal(writes.length,0);locked=false;
   dbError=true;await assert.rejects(sync.syncPlaystationDigiSellerStock());assert.equal(writes.length,0);dbError=false;
   fail=true;await assert.rejects(sync.syncPlaystationDigiSellerStock());assert.equal(writes.length,0);fail=false;
   precheck.precheck_url='https://custom.example/check';await assert.rejects(sync.syncPlaystationDigiSellerStock(),/custom/);assert.equal(writes.length,0);
 }finally{global.fetch=realFetch;}

 const selection=load('lib/digiseller-customer-information.ts');
 const route=load('app/api/digiseller/stock-check/route.ts',{'next/server':{NextResponse:{json:(data,init)=>({data,...init})}},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/digiseller-playstation-stock':stock,'@/lib/digiseller-customer-information':selection});
 const body={product:{id:STOCK_ID,cnt:1,lang:'en-US'},options:[{id:90,type:'radio',value:'102'}]};
 const post=body=>route.POST({text:async()=>JSON.stringify(body)});
 assert.equal((await post(body)).data.error,'');
 assert((await post({...body,product:{...body.product,cnt:2}})).data.error.includes('unavailable'));
 assert((await post({...body,options:[{id:90,type:'radio',value:'100'}]})).data.error.includes('sold out'));
 assert((await post({...body,options:[]})).data.error);
 assert((await post({...body,options:[...body.options,...body.options]})).data.error);
 assert((await post({...body,options:[{id:90,type:'text',value:'102'}]})).data.error,'numeric text cannot choose a variant');
 for(const cnt of [0,-1,1.5,1001])assert((await post({...body,product:{...body.product,cnt}})).data.error);
 assert((await post({...body,product:{...body.product,id:123}})).data.error,'other listings never accepted');
 counts=[0,0,0,0,0];assert.match((await post({...body,product:{...body.product,lang:'ru-RU'}})).data.error,/номинал/);
 dbError=true;assert((await post(body)).data.error);dbError=false;
 assert((await route.POST({text:async()=>'not JSON'})).data.error);assert((await post(null)).data.error);

 const pricing=load('lib/digiseller-pricing.ts');const snapshot={id:STOCK_ID,base:12,currency:'USD',enabled:true,parameters:[{...remote,variants:remote.variants.map((v,i)=>({...v,visible:i===3}))}]};
 const priceOptions=options.map((o,i)=>({id:o.id,name:o.denomination+' INR',price:12*(i+1),productId:STOCK_ID,optionId:90,variantId:100+i}));
 assert.equal(pricing.buildPricePlan(priceOptions,[snapshot],'5').rows.length,5,'hidden stock options can still update prices');
 assert.throws(()=>pricing.buildPricePlan(priceOptions.filter((_,i)=>i!==3),[snapshot],'5'),'unmatched visible denominations still rejected');
 const originalSecret=process.env.CRON_SECRET;let scheduledCalls=0;
 const cron=load('app/api/cron/digiseller-playstation-stock/route.ts',{'next/server':{NextResponse:{json:(data,init)=>({data,...init})}},'@/lib/digiseller-playstation-stock-sync':{syncPlaystationDigiSellerStock:async()=>{scheduledCalls++;return {changed:0,skipped:false}}}});
 try{
   delete process.env.CRON_SECRET;assert.equal((await cron.GET(new Request('https://test'))).status,503);
   process.env.CRON_SECRET='stock-test-secret-for-fixtures-only';
   assert.equal((await cron.GET(new Request('https://test'))).status,401);
   assert.equal((await cron.GET(new Request('https://test',{headers:{authorization:'Bearer incorrect'}}))).status,401);
   assert.equal(scheduledCalls,0);
   assert.equal((await cron.GET(new Request('https://test',{headers:{authorization:'Bearer '+process.env.CRON_SECRET}}))).data.ok,true);assert.equal(scheduledCalls,1);
 }finally{if(originalSecret===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=originalSecret;}
 console.log('PASS: target-only stock counts, sold-out hiding, default selection, restocking, unchanged prices, no-op retries, database/API failure, pricing lock, custom precheck protection, EN/RU pre-payment checks and hidden-option price updates.');
})().catch(e=>{console.error(e);process.exitCode=1});
