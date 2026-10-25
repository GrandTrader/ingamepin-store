const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const clone=x=>JSON.parse(JSON.stringify(x));
function load(file,mocks={},globals={}) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports,require:n=>n==='server-only'?{}:n in mocks?mocks[n]:n==='./wupex-relay'?{requestWupexThroughRelay:async r=>globals.fetch(r.baseUrl+r.endpoint,{method:r.method,headers:{'x-api-key':r.apiKey},body:r.body===undefined?undefined:JSON.stringify(r.body),redirect:'error',cache:'no-store'})}:require(n),Buffer,URL,AbortSignal,Date,process,...globals
 });
 return exports;
}
const creds={baseUrl:'https://sandbox-service.wupex.com',apiKey:'fixture-api-key-123',merchantCode:'fixture-merchant'};
const product={productId:101,productName:'Apple Gift Card $4 (USA)',productCode:'APPLE-USA-4USD',price:4.1,available:250,cardType:'voucher',regionName:'USA',faceValue:4};
const catalog={status:true,pageInfo:{totalPage:1,totalCount:1,pageSize:20,currentPage:1},data:[product]};
const api=load('lib/wupex-api.ts');
test('Only Wupex HTTPS service roots can receive credentials',()=>{
 assert.equal(api.normalizeWupexBaseUrl(creds.baseUrl+'/'),creds.baseUrl);
 for(const value of ['http://sandbox-service.wupex.com','https://wupex.com.evil.test','https://evil.test','https://127.0.0.1','https://portal.wupex.com','https://sandbox-portal.wupex.com','https://sandbox-service.wupex.com:444','https://a:b@sandbox-service.wupex.com','https://sandbox-service.wupex.com/path','https://sandbox-service.wupex.com/?key=test','https://sandbox-service.wupex.com/#hash'])assert.throws(()=>api.normalizeWupexBaseUrl(value));
 for(const bad of [{apiKey:'YOUR_API_KEY'},{apiKey:'{{x-api-key}}'},{apiKey:'key\ninjection'},{merchantCode:'<merchant>'}])assert.throws(()=>api.validateWupexCredentials({...creds,...bad}));
 assert.equal(api.wupexConnectionId(creds),api.wupexConnectionId({...creds,apiKey:'rotated-fixture-key'}));
 assert.notEqual(api.wupexConnectionId(creds),api.wupexConnectionId({...creds,merchantCode:'other-merchant'}));
});
test('Balance/catalogue reads follow the supplied contract without placing orders',async()=>{
 const calls=[];
 const a=load('lib/wupex-api.ts',{}, {fetch:async(url,options)=>{
  calls.push({url,options});
  return Response.json(url.endsWith('/balance')?{status:true,data:{balance:1250.75,currency:'USD'}}:url.endsWith('/status')?{status:true,data:{enabled:false}}:catalog);
 }});
 assert.deepEqual(clone(await a.getWupexBalance(creds)),{amount:1250.75,currency:'USD'});
 assert.equal(await a.getWupexPreorderStatus(creds),false);
 assert.equal((await a.getWupexCatalog(creds,1,'apple','voucher')).products[0].available,250);
 assert.deepEqual(calls.map(c=>c.options.method),['GET','GET','POST']);
 const body=JSON.parse(calls[2].options.body);assert.equal(body.pageSize,20);assert.equal(body.search[0].value,'apple');assert.equal(body.search[1].value,'voucher');
 for(const call of calls){assert.equal(call.options.headers['x-api-key'],creds.apiKey);assert.equal(call.options.redirect,'error');assert.equal(call.options.cache,'no-store');assert(!call.url.includes(creds.apiKey));assert(!call.url.includes('/api/order/'));}
 await assert.rejects(a.getWupexCatalog(creds,0));await assert.rejects(a.getWupexCatalog(creds,1,'','bad'));
 assert.equal(calls.length,3);
});
test('Supplier failures and malformed payloads fail closed and do not reveal keys',async()=>{
 for(const scenario of ['http','envelope','network','invalid-json']) {
  let calls=0;const a=load('lib/wupex-api.ts',{}, {fetch:async()=>{
   calls++;if(scenario==='network')throw Error(creds.apiKey);
   if(scenario==='http')return Response.json({error:creds.apiKey},{status:403});
   if(scenario==='invalid-json')return new Response(creds.apiKey);
   return Response.json({status:false,description:creds.apiKey});
  }});
  await assert.rejects(a.getWupexBalance(creds),e=>!e.message.includes(creds.apiKey));assert.equal(calls,1);
 }
 for(const value of [null,true,'',Infinity,'NaN'])assert.throws(()=>api.parseWupexBalance({balance:value,currency:'USD'}));
 assert.equal(api.parseWupexBalance({balance:0,currency:'USD'}).amount,0);
 for(const currency of [true,42,{},[], 'US','USDollars','USD123'])assert.throws(()=>api.parseWupexBalance({balance:1,currency}),/invalid balance currency/);
 for(const patch of [{price:null},{available:-1},{available:1.2},{cardType:'other'},{productId:0},{productName:''},{cardType:'topup',subType:6}])assert.throws(()=>api.parseWupexCatalog({...catalog,data:[{...product,...patch}]},1));
 assert.throws(()=>api.parseWupexCatalog({...catalog,data:[product,product]},1));
 assert.throws(()=>api.parseWupexCatalog(catalog,2));
 assert.equal(api.parseWupexCatalog({...catalog,data:[{...product,available:undefined}]},1).products[0].available,null);
});
test('Voucher subtype zero is not a top-up identifier; top-up subtypes remain validated',()=>{
 for(const subType of [0,'0',undefined,null]){
  const parsed=api.parseWupexCatalog({...catalog,data:[{...product,subType}]},1);
  assert.equal(parsed.products[0].subType,null);
  assert.equal(parsed.products[0].id,product.productId);
  assert.equal(parsed.products[0].available,product.available);
 }
 for(const subType of [1,2,3,4,5]){
  assert.equal(api.parseWupexCatalog({...catalog,data:[{...product,cardType:'topup',subType}]},1).products[0].subType,subType);
 }
 for(const subType of [0,'0',-1,1.5,6]){
  assert.throws(()=>api.parseWupexCatalog({...catalog,data:[{...product,cardType:'topup',subType}]},1));
 }
});

test('Balance uses documented USD when omitted and normalizes explicit currency without truncation',async()=>{
 for(const data of [{balance:0},{balance:'1250.75',currency:null},{balance:4,currency:''},{balance:4,currency:'  '},{balance:4,currency:' usd '}]){
  const a=load('lib/wupex-api.ts',{}, {fetch:async()=>Response.json({status:true,data})});
  assert.deepEqual(clone(await a.getWupexBalance(creds)),{amount:Number(data.balance),currency:'USD'});
 }
 assert.equal(api.parseWupexBalance({balance:4,currency:' eur '}).currency,'EUR');
 for(const balance of [undefined,null,true,'',Infinity,'NaN'])assert.throws(()=>api.parseWupexBalance({balance}),/invalid amount/);
 assert.throws(()=>api.parseWupexBalance({currency:'USD'}),/invalid amount/);
});

test('Oversized responses stop reading before unbounded allocation',async()=>{
 let canceled=false;
 const a=load('lib/wupex-api.ts',{}, {fetch:async()=>({ok:true,body:{getReader:()=>({read:async()=>({done:false,value:new Uint8Array(4*1024*1024+1)}),cancel:async()=>{canceled=true}})}})});
 await assert.rejects(a.getWupexBalance(creds),/too much data/);assert(canceled);
});
test('Credentials are encrypted, authenticated and isolated from other suppliers',()=>{
 const storage=load('lib/wupex-storage.ts',{'@/lib/supabase/admin':{},'./wupex-api':api},{process:{env:{WUPEX_ENCRYPTION_KEY:'x'.repeat(40)}}});
 const encrypted=storage.sealWupexCredentials(creds);
 assert(!encrypted.includes(creds.apiKey));assert.deepEqual(clone(storage.unsealWupexCredentials(encrypted)),creds);
 assert.notEqual(encrypted,storage.sealWupexCredentials(creds));
 const wrong=load('lib/wupex-storage.ts',{'@/lib/supabase/admin':{},'./wupex-api':api},{process:{env:{WUPEX_ENCRYPTION_KEY:'y'.repeat(40)}}});
 assert.throws(()=>wrong.unsealWupexCredentials(encrypted),/could not be read/);
 const parts=encrypted.split('.');parts[2]='A'.repeat(parts[2].length);assert.throws(()=>storage.unsealWupexCredentials(parts.join('.')));
});
function actions(options={}) {
 let calls=[];let saved;
 const q={select(){return q},limit:async()=>({data:[],error:options.dbError?{}:null}),upsert:async row=>{calls.push('save');saved=row;return{error:options.dbError?{}:null}}};
 const a=load('app/admin/wupex/actions.ts',{
  'next/cache':{revalidatePath:path=>calls.push(path)},
  '@/lib/wupex-admin':{requireWupexAdmin:async()=>{calls.push('auth');if(options.denied)throw Error('denied');return{db:{from:()=>q},userId:'admin'}}},
  '@/lib/wupex-api':{...api,getWupexBalance:async()=>{calls.push('balance');if(options.upstreamError)throw new api.WupexError('Access denied');return options.balanceData?api.parseWupexBalance(options.balanceData):{amount:0,currency:'USD'}},getWupexPreorderStatus:async()=>false,getWupexCatalog:async()=>{calls.push('catalog');return catalog}},
  '@/lib/wupex-storage':{wupexEnvironmentConfigured:()=>!!options.environment,sealWupexCredentials:()=> 'encrypted-only',readWupexCredentials:async()=>creds,requireWupexCredentials:async()=>creds}
 });
 return{...a,calls,get saved(){return saved}};
}
const form=()=>{const f=new FormData();for(const[k,v]of Object.entries(creds))f.set(k,v);return f;};
test('Connecting requires admin, verifies without purchase, and stores ciphertext only',async()=>{
 const a=actions();assert.equal((await a.connectWupex(form())).data,true);
 assert.deepEqual(a.calls,['auth','balance','save','/admin/wupex']);
 assert.equal(a.saved.credentials_ciphertext,'encrypted-only');assert(!JSON.stringify(a.saved).includes(creds.apiKey));
 for(const scenario of [{denied:true},{environment:true},{upstreamError:true}]) {
  const a=actions(scenario);
  if(scenario.denied)await assert.rejects(a.connectWupex(form()),/denied/);
  else assert((await a.connectWupex(form())).error);
  assert(!a.calls.includes('save'));
 }
 assert((await actions({dbError:true}).connectWupex(form())).error);
});
test('Connecting saves a verified balance without currency and refuses malformed balances',async()=>{
 const a=actions({balanceData:{balance:0}});
 assert.equal((await a.connectWupex(form())).data,true);
 assert.deepEqual(a.calls,['auth','balance','save','/admin/wupex']);
 for(const balanceData of [{balance:null},{currency:'USD'},{balance:1,currency:'USDollars'}]){
  const invalid=actions({balanceData});
  assert((await invalid.connectWupex(form())).error);
  assert(!invalid.calls.includes('save'));
 }
});

test('Every dashboard and catalogue action authenticates before reading supplier information',async()=>{
 for(const method of ['loadWupexDashboard','loadWupexProducts']){
  const a=actions({denied:true});await assert.rejects(a[method](1,'',''),/denied/);assert.deepEqual(a.calls,['auth']);
 }
 const a=actions(),dashboard=await a.loadWupexDashboard();
 assert.equal(dashboard.connected,true);assert.equal(dashboard.balance.amount,0);assert.equal(dashboard.sandbox,true);
 assert(!JSON.stringify(dashboard).includes(creds.apiKey));assert(!JSON.stringify(dashboard).includes(creds.merchantCode));
});

test('Catalogue combines category, region, name and type on the supplier and preserves them for import lookup',async()=>{
 const calls=[];
 const a=load('lib/wupex-api.ts',{}, {fetch:async(url,options)=>{calls.push(JSON.parse(options.body));return Response.json({...catalog,data:[{...product,productType:'Apple Gift Card'}]});}});
 const filters={category:'Apple Gift Card',region:'USA'};
 const result=await a.getWupexCatalog(creds,1,'Apple','voucher',20,filters);
 assert.equal(result.products[0].category,'Apple Gift Card');
 assert.deepEqual(calls[0].search,[
  {column:'productName',operator:'Contains',value:'Apple'},
  {column:'cardType',operator:'Equals',value:'voucher'},
  {column:'productType',operator:'Equals',value:'Apple Gift Card'},
  {column:'regionName',operator:'Equals',value:'USA'}
 ]);
 await a.findWupexProducts(creds,[101],'Apple',filters);
 assert(calls[1].search.some(f=>f.column==='productType'&&f.value===filters.category));
 assert(calls[1].search.some(f=>f.column==='regionName'&&f.value==='USA'));
 for(const invalid of [null,[],{category:{}},{category:'a'.repeat(201)},{region:'a'.repeat(101)},{region:'US\nA'}])await assert.rejects(a.getWupexCatalog(creds,1,'','',20,invalid));
 assert.equal(calls.length,2);
});
test('Wupex zero-sized empty pages render no results but malformed nonempty pages stay rejected',()=>{
 const empty={status:true,pageInfo:{currentPage:1,totalPage:0,totalCount:0,pageSize:0},data:[]};
 assert.deepEqual(clone(api.parseWupexCatalog(empty,1)),{products:[],page:1,pageSize:20,totalPages:0,totalCount:0});
 assert.equal(api.parseWupexCatalog(empty,1,100).pageSize,100);
 assert.throws(()=>api.parseWupexCatalog({...empty,data:[product]},1));
 assert.throws(()=>api.parseWupexCatalog({...empty,pageInfo:{...empty.pageInfo,totalCount:1,totalPage:1}},1));
});
test('Filter lists collect all pages, deduplicate and never return partial results',async()=>{
 const calls=[];
 const pages=[
  {categories:['Steam'],regions:['USA'],count:100,totalCount:201,totalPages:3},
  {categories:['Apple','Steam'],regions:['India'],count:100,totalCount:201,totalPages:3},
  {categories:['Xbox'],regions:['USA','Global'],count:1,totalCount:201,totalPages:3},
 ];
 const make=read=>load('lib/wupex-catalog-filters.ts',{'next/cache':{},'./wupex-api':{...api,getWupexFilterPage:read}});
 const filters=make(async(c,page)=>{calls.push(page);return pages[page-1]});
 assert.deepEqual(clone(await filters.collectWupexCatalogFilters(creds)),{categories:['Apple','Steam','Xbox'],regions:['Global','India','USA']});
 assert.deepEqual(calls,[1,2,3]);
 await assert.rejects(make(async(c,p)=>{if(p===2)throw Error('read failed');return pages[p-1]}).collectWupexCatalogFilters(creds),/read failed/);
 await assert.rejects(make(async(c,p)=>p===2?{...pages[1],totalCount:202}:pages[p-1]).collectWupexCatalogFilters(creds),/changed/);
 await assert.rejects(make(async(c,p)=>p===2?{...pages[1],count:99}:pages[p-1]).collectWupexCatalogFilters(creds),/complete/);
});
test('Cached filter names are isolated by account and key and never use raw API keys as cache keys',async()=>{
 const keys=[],cache=new Map();let reads=0;
 const filters=load('lib/wupex-catalog-filters.ts',{
  'next/cache':{unstable_cache:(fn,parts,options)=>async()=>{const key=JSON.stringify(parts);keys.push(key);assert.equal(options.revalidate,900);if(!cache.has(key))cache.set(key,await fn());return cache.get(key);}},
  './wupex-api':{...api,getWupexFilterPage:async()=>{reads++;return{categories:['Apple'],regions:['USA'],count:1,totalCount:1,totalPages:1};}},
 });
 await filters.getCachedWupexCatalogFilters(creds);
 await filters.getCachedWupexCatalogFilters(creds);
 await filters.getCachedWupexCatalogFilters({...creds,merchantCode:'another-account'});
 await filters.getCachedWupexCatalogFilters({...creds,apiKey:'another-test-key'});
 assert.equal(reads,3);assert.equal(keys[0],keys[1]);assert.notEqual(keys[0],keys[2]);assert.notEqual(keys[0],keys[3]);
 assert(keys.every(k=>!k.includes(creds.apiKey)&&!k.includes('another-test-key')));
});
test('Category and region endpoint authenticates before accessing settings or supplier data',async()=>{
 const calls=[];
 const mocks={
  '@/lib/wupex-admin':{requireWupexAdmin:async()=>{calls.push('auth');throw Error('denied')}},
  '@/lib/wupex-storage':{requireWupexCredentials:async()=>{calls.push('credentials');return creds}},
  '@/lib/wupex-catalog-filters':{getCachedWupexCatalogFilters:async()=>{calls.push('filters');return{categories:['Apple'],regions:['USA']}}},
  '@/lib/wupex-api':api
 };
 await assert.rejects(load('app/api/admin/wupex/catalog-filters/route.ts',mocks,{Response}).GET(),/denied/);
 assert.deepEqual(calls,['auth']);
 mocks['@/lib/wupex-admin'].requireWupexAdmin=async()=>calls.push('auth');
 const response=await load('app/api/admin/wupex/catalog-filters/route.ts',mocks,{Response}).GET();
 assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 assert.deepEqual(await response.json(),{data:{categories:['Apple'],regions:['USA']}});
 assert.deepEqual(calls,['auth','auth','credentials','filters']);
});
