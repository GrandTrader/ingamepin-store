const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,mocks={}){const m={exports:{}};new Function('module','exports','require',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(m,m.exports,n=>{if(n in mocks)return mocks[n];throw Error('Unexpected import '+n)});return m.exports;}
const lib=load('lib/digiseller-order-log.ts');
const product='11111111-1111-4111-8111-111111111111';
const tables=['digiseller_deliveries','digiseller_supplier_jobs','digiseller_fkwallet_jobs'];
function fixture({fail=false,rowsPerSource=30}={}){
 const queries=[];
 const data=Object.fromEntries(tables.map((table,source)=>[table,Array.from({length:rowsPerSource},(_,i)=>({invoice_id:100+i*3+source,digiseller_product_id:6204670,product_id:product,
 gift_card_codes:{product_options:{option_name:'100 INR'}},product_options:{option_name:'100 INR'},quantity:3,state:i%2?'DELIVERED':'WAITING',
 delivered_at:'2026-10-26T00:00:00Z',created_at:'2026-10-26T00:00:00Z',goods:'TEST-VOUCHER-'+i})).concat([{invoice_id:999999,product_id:'other-product',goods:'PRIVATE OTHER PRODUCT',state:'DELIVERED'}])]));
 const db={from(table){const q={table,filters:[]};queries.push(q);const chain={
  select(fields){q.fields=fields;return this},eq(k,v){q.filters.push(['eq',k,v]);return this},lt(k,v){q.filters.push(['lt',k,v]);return this},order(k,opts){q.order=[k,opts];return this},limit(n){q.limit=n;return this},maybeSingle(){q.single=true;return this},
  then(resolve,reject){let rows=data[table].filter(row=>q.filters.every(([op,k,v])=>{const got=k.endsWith('.product_id')?row.product_id:row[k];return op==='eq'?String(got)===String(v):Number(got)<Number(v)})).sort((a,b)=>b.invoice_id-a.invoice_id).slice(0,q.limit);
   if(!q.fields.startsWith('goods,'))rows=rows.map(({goods,...row})=>row);
   return Promise.resolve({data:q.single?rows[0]??null:rows,error:fail?{message:'PRIVATE DB ERROR'}:null}).then(resolve,reject)}
 };return chain}};
 return {db,queries};
}
test('product history spans owned stock and both suppliers without exposing codes or current mapping dependencies',async()=>{
 const f=fixture(),result=await lib.readDigiSellerOrderLog(f.db,product);
 assert.equal(result.rows.length,25);assert.equal(result.rows[0].invoiceId,'189');assert.equal(result.next,'165');
 assert.equal(new Set(result.rows.map(x=>x.source)).size,3);
 assert(!JSON.stringify(result).includes('TEST-VOUCHER'));
 for(const q of f.queries){assert(q.filters.some(([op,k,v])=>op==='eq'&&k.endsWith('.product_id')&&v===product));assert(!/goods|supplier_payload|is_active|digiseller_product_id\.eq/.test(q.fields));assert.equal(q.limit,26);assert.equal(q.order[0],'invoice_id');}
 assert(result.rows.filter(x=>x.source==='stock').every(x=>x.quantity===1&&x.state==='DELIVERED'));
});
test('cursor pagination reads every record once across sources, with bounded queries',async()=>{
 const f=fixture(),ids=[];let before;
 do{const page=await lib.readDigiSellerOrderLog(f.db,product,{before});ids.push(...page.rows.map(x=>Number(x.invoiceId)));before=page.next;}while(before);
 assert.equal(ids.length,90);assert.equal(new Set(ids).size,90);assert.deepEqual(ids,Array.from({length:90},(_,i)=>189-i));
 assert(f.queries.every(q=>q.limit===26));
});
test('Sold products contains delivered invoices only, search reaches older invoices',async()=>{
 const f=fixture();const page=await lib.readDigiSellerOrderLog(f.db,product,{deliveredOnly:true});
 assert(page.rows.every(x=>x.state==='DELIVERED'));
 const found=await lib.readDigiSellerOrderLog(f.db,product,{invoice:'101'});
 assert.equal(found.rows.length,1);assert.equal(found.rows[0].state,'WAITING');
 assert.equal((await lib.readDigiSellerOrderLog(f.db,product,{invoice:'101',deliveredOnly:true})).rows.length,0);
 assert.equal((await lib.readDigiSellerOrderLog(f.db,product,{invoice:'999999'})).rows.length,0);
});
test('delivery detail is tied to product, invoice and delivered status for every source',async()=>{
 for(const [index,source]of ['stock','definiteplay','fkwallet'].entries()){
  const f=fixture();
  assert.equal(await lib.readDigiSellerDeliveredContent(f.db,product,source,String(103+index)),'TEST-VOUCHER-1');
  assert.equal(await lib.readDigiSellerDeliveredContent(f.db,product,source,'999999'),null);
  if(source!=='stock')assert.equal(await lib.readDigiSellerDeliveredContent(f.db,product,source,String(100+index)),null);
  assert(f.queries.every(q=>q.fields.startsWith('goods,')&&q.filters.some(x=>x[1].endsWith('.product_id')&&x[2]===product)));
 }
});
test('database errors fail visibly without returning partial history or secret details',async()=>{
 await assert.rejects(()=>lib.readDigiSellerOrderLog(fixture({fail:true}).db,product),/Unable to load DigiSeller orders/);
 await assert.rejects(()=>lib.readDigiSellerDeliveredContent(fixture({fail:true}).db,product,'stock','100'),/Unable to load delivered content/);
});
function routeFixture({user=true,mfa=true,admin=true,accessError=false,fail=false,missing=false}={}){
 const calls=[];
 const session={auth:{getUser:async()=>({data:{user:user?{id:'owner'}:null}})},from(){return{select(){return this},eq(){return this},maybeSingle:async()=>({data:admin?{user_id:'owner'}:null,error:accessError?{}:null})}}};
 const route=load('app/api/admin/products/[id]/digiseller-orders/route.ts',{
  'next/server':{NextResponse:{json:(body,options)=>Response.json(body,options)}},
  '@/lib/supabase/server':{createClient:async()=>session},
  '@/lib/supabase/admin':{createAdminClient:()=>{calls.push('admin-client');return{}}},
  '@/lib/admin-assurance':{hasRequiredAdminAssurance:async()=>mfa},
  '@/lib/digiseller-order-log':{...lib,
   readDigiSellerOrderLog:async(...args)=>{calls.push(['list',...args.slice(1)]);if(fail)throw Error('PRIVATE DB');return{rows:[],next:null}},
   readDigiSellerDeliveredContent:async(...args)=>{calls.push(['detail',...args.slice(1)]);if(fail)throw Error('PRIVATE DB');return missing?null:'TEST CODE'},
  }
 });
 return {calls,get:(query='',id=product)=>route.GET(new Request('http://fixture.test/api/admin/products/'+id+'/digiseller-orders?'+query),{params:Promise.resolve({id})})};
}
test('API requires authenticated admin and MFA before both lists and codes',async()=>{
 for(const config of [{user:false},{mfa:false},{admin:false},{accessError:true}])for(const query of ['', 'source=stock&invoice=100']){
  const f=routeFixture(config),r=await f.get(query);assert([401,403].includes(r.status));assert.equal(f.calls.length,0);assert.match(r.headers.get('cache-control'),/private, no-store/);
 }
});
test('API rejects invalid IDs, invoice/cursor injections and unrecognized sources',async()=>{
 for(const query of ['invoice=-1','invoice=1.2','invoice=1,or(state.eq.DELIVERED)','invoice=9007199254740992','before=bad','source=stock','source=other&invoice=100','delivered=0']){
  const f=routeFixture();assert.equal((await f.get(query)).status,400,query);assert.equal(f.calls.length,0);
 }
 const f=routeFixture();assert.equal((await f.get('','bad')).status,400);
});
test('API returns no-store scoped data, missing content 404, and sanitized failures',async()=>{
 const f=routeFixture(),list=await f.get('invoice=100&before=200&delivered=1');
 assert.equal(list.status,200);assert.deepEqual(f.calls.at(-1),['list',product,{invoice:'100',before:'200',deliveredOnly:true}]);
 const detail=await f.get('source=stock&invoice=100');assert.equal((await detail.json()).goods,'TEST CODE');assert.deepEqual(f.calls.at(-1),['detail',product,'stock','100']);assert.match(detail.headers.get('cache-control'),/no-store/);
 assert.equal((await routeFixture({missing:true}).get('source=stock&invoice=100')).status,404);
 const failure=await routeFixture({fail:true}).get();assert.equal(failure.status,500);assert(!JSON.stringify(await failure.json()).includes('PRIVATE'));
});
