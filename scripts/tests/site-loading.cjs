const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>{if(n in mocks)return mocks[n];if(n==='server-only')return {};if(n==='react'||n==='react/jsx-runtime')return require(n);throw Error('Missing mock '+n);},console,Date,Map,Set,Request,Headers,URL});return exports;}
function renderCache(){let render=null;return {run:async fn=>{render=new Map();try{return await fn();}finally{render=null;}},cache:fn=>(...args)=>{if(!render)return fn(...args);if(!render.has(fn))render.set(fn,new Map());const values=render.get(fn),key=JSON.stringify(args);if(!values.has(key))values.set(key,fn(...args));return values.get(key);}};}
test('render verification runs once, a new user/render is verified afresh, mutations remain live',async()=>{
 const scope=renderCache();let user={id:'a'},expired=false,auth=0,expiry=0;
 const api=load('lib/supabase/server.ts',{'react':scope,'next/navigation':{redirect:p=>{throw Error('REDIRECT '+p);}},'./auth-server':{createClient:async()=>({auth:{getUser:async()=>{auth++;return {data:{user},error:null};}}})},'@/lib/password-expiry':{getPasswordExpiry:async()=>{expiry++;return {required:expired};}}});
 await scope.run(async()=>{const [a,b]=await Promise.all([api.createClient(),api.createClient()]);assert.equal(a,b);await Promise.all([a.auth.getUser(),b.auth.getUser()]);assert.equal(auth,1);assert.equal(expiry,1);});
 user={id:'b'};await scope.run(async()=>assert.equal((await (await api.createClient()).auth.getUser()).data.user.id,'b'));assert.equal(auth,2);assert.equal(expiry,2);
 // No React render dispatcher in actions/route handlers: both calls verify.
 const mutation=await api.createClient();await mutation.auth.getUser();expired=true;await assert.rejects(mutation.auth.getUser(),/renew-password/);assert.equal(auth,4);assert.equal(expiry,4);
});
test('explicit tokens and failed security checks cannot be served from render memoization',async()=>{
 const scope=renderCache();let auth=0;
 const api=load('lib/supabase/server.ts',{'react':scope,'next/navigation':{redirect:()=>{}},'./auth-server':{createClient:async()=>({auth:{getUser:async()=>{auth++;return {data:{user:{id:'a'}},error:null};}}})},'@/lib/password-expiry':{getPasswordExpiry:async()=>{throw Error('Security unavailable');}}});
 await scope.run(async()=>{const a=await api.createClient();await assert.rejects(a.auth.getUser('jwt-one'),/unavailable/);await assert.rejects(a.auth.getUser('jwt-two'),/unavailable/);});assert.equal(auth,2);
});
function queryRows(table,rows,calls){const filters=[],q={};for(const k of ['select','eq','order','or'])q[k]=(...args)=>{filters.push([k,...args]);return q;};q.range=(from,to)=>{filters.push(['range',from,to]);return q;};q.then=(a,b)=>{calls.push({table,filters});const range=filters.find(f=>f[0]==='range');return Promise.resolve({data:rows.filter(row=>filters.filter(f=>f[0]==='eq').every(([,key,value])=>row[key]===value)).slice(range?.[1]??0,(range?.[2]??rows.length)+1),error:null}).then(a,b);};return q;}
test('shared public catalogue paginates, excludes unpublished/non-retail rows, caches and refreshes on invalidation',async()=>{
 const calls=[],memo=new Map(),cacheSettings=[];let rows=Array.from({length:501},(_,i)=>({id:String(i),status:'ACTIVE',retail_enabled:true,is_preorder_only:false,price:10}));rows.push({id:'draft',status:'DRAFT',retail_enabled:true,is_preorder_only:false},{id:'business',status:'ACTIVE',retail_enabled:false,is_preorder_only:false},{id:'preorder',status:'ACTIVE',retail_enabled:true,is_preorder_only:true});
 const api=load('lib/store-catalogue.ts',{'@/lib/product-promotion-data':{cataloguePromotions:async()=>new Map()},'@/lib/product-search-pages':load('lib/product-search-pages.ts'),'@/lib/supabase/admin':{createAdminClient:()=>({from:t=>queryRows(t,rows,calls)})},'next/cache':{unstable_cache:(fn,key,options)=>{cacheSettings.push(options);return (...args)=>{const k=JSON.stringify([key,args]);if(!memo.has(k))memo.set(k,fn(...args));return memo.get(k);};}}});
 assert.equal((await api.getStoreProducts()).length,501);assert.equal(calls.length,2);await api.getStoreProducts();assert.equal(calls.length,2);rows[0]={...rows[0],price:25};memo.clear();assert.equal((await api.getStoreProducts())[0].price,25);assert.equal(calls.length,4);assert(cacheSettings.every(s=>s.revalidate===30&&s.tags.includes('homepage-store-data')));
 const selected=calls[0].filters.find(f=>f[0]==='select')[1];assert(!/customer_email|password|supplier_cost|customer_product_discounts/.test(selected));
});
test('purchase list pagination preserves verified identity filters and remains uncached',async()=>{
 const calls=[],rows=Array.from({length:45},(_,i)=>({order_number:String(i)}));const api=load('lib/purchase-list.ts',{'@/lib/supabase/admin':{createAdminClient:()=>({from:t=>queryRows(t,rows,calls)})}});
 await assert.rejects(api.readPurchaseList({email:'a@x.test',userId:null,source:'guest'},0),/Invalid page/);assert.equal(calls.length,0);
 const result=await api.readPurchaseList({email:'a@x.test',userId:'account-a',source:'account'},2);assert.equal(result.orders.length,20);assert.equal(result.orders[0].order_number,'20');assert.equal(result.hasMore,true);assert(calls[0].filters.some(f=>f[0]==='or'&&f[1]==='customer_id.eq.account-a,customer_email.eq."a@x.test"'));
 await api.readPurchaseList({email:'guest@x.test',userId:null,source:'guest'},1);assert(calls[1].filters.some(f=>f[0]==='eq'&&f[1]==='customer_email'&&f[2]==='guest@x.test'));assert(!calls[1].filters.some(f=>f[0]==='or'));
});
test('initial purchases require existing identity and rate checks before reading private history',async()=>{
 for(const scenario of ['anonymous','account','blocked','failure']){
  let reads=0,limits=0;const identity=scenario==='anonymous'?null:{email:'a@x.test',userId:'a',source:'account'};
  const Component=load('components/InitialPurchases.tsx',{'next/headers':{headers:async()=>new Headers()},'@/components/PurchaseVerification':{default:()=>null},'@/lib/purchase-access':{purchaseIdentity:async()=>identity},'@/lib/request-security':{requestLimit:async(_,scope,limit,seconds)=>{limits++;assert.equal(scope,'purchase-read');assert.equal(limit,120);assert.equal(seconds,60);return scenario==='blocked'?{}:null;}},'@/lib/purchase-list':{readPurchaseList:async(i,page)=>{reads++;assert.equal(i,identity);assert.equal(page,2);if(scenario==='failure')throw Error('offline');return {orders:[],email:i.email,page};}}}).default;
  const tree=await Component({page:2});assert.equal(limits,scenario==='anonymous'?0:1);assert.equal(reads,['account','failure'].includes(scenario)?1:0);assert.equal(Boolean(tree.props.initialError),['blocked','failure'].includes(scenario));
 }
});
test('public navigation sends small category summaries, including unlimited-stock products',async()=>{
 const module=load('app/api/store/navigation/route.ts',{'next/server':{NextResponse:{json:(body)=>body}},'@/lib/store-catalogue':{getStoreCategories:async()=>[{id:'c',name:'Games',slug:'games'}],getStoreProducts:async()=>[{category_id:'c',stock_quantity:-1,sold_count:9,product_options:[],secret:'never serialize inventory'}]}});const result=await module.GET();assert.equal(result.featured[0].sales,9);assert.equal(result.categories.length,1);assert(!JSON.stringify(result).includes('stock_quantity'));assert(!JSON.stringify(result).includes('secret'));
});
