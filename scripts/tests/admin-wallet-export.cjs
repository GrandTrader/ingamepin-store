const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript');
function load(file, imports = {}) {
 const mod = { exports: {} };
 const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 new Function('exports', 'require', 'module', code)(mod.exports, name => name in imports ? imports[name] : require(name), mod);
 return mod.exports;
}
const a='11111111-1111-4111-8111-111111111111', b='22222222-2222-4222-8222-222222222222';
function makeRows(count) {
 return Array.from({length:count},(_,i)=>({id:'aaaaaaaa-aaaa-4aaa-8aaa-'+String(i+1).padStart(12,'0'),user_id:i%3?a:b,transaction_type:i%3===0?'REFUND':i%2?'CREDIT':'DEBIT',amount:'12.50',balance_before:'100.00',balance_after:i%2?'112.50':'87.50',description:'Wallet activity',reference_id:'ORDER-'+(i+1),order_id:null,created_at:new Date(Date.UTC(2020,9,17,12)-Math.floor(i/4)*1000).toISOString()}));
}
function setup(options={}) {
 const queries=[],identityIds=[];let privileged=0,ledgerReads=0;
 const rows=options.rows??makeRows(1205);
 const customers=options.customers??{[a]:{id:a,email:'nicolas@example.com',user_metadata:{full_name:'Nicolas'}},[b]:{id:b,email:'mary@example.com',user_metadata:{full_name:'Mary'}}};
 function from(table) {
  const q={table,filters:[],ordering:[]};queries.push(q);
  const builder={
   select(){return builder;},eq(k,v){q.filters.push(['eq',k,v]);return builder;},gte(k,v){q.filters.push(['gte',k,v]);return builder;},lt(k,v){q.filters.push(['lt',k,v]);return builder;},lte(k,v){q.filters.push(['lte',k,v]);return builder;},in(k,v){q.filters.push(['in',k,v]);return builder;},ilike(k,v){q.filters.push(['ilike',k,v]);return builder;},or(value){q.cursor=value;return builder;},order(k,v){q.ordering.push([k,v]);return builder;},limit(value){q.limit=value;return builder;},abortSignal(){return builder;},
   then(resolve,reject){
    let data=table==='wallet_transactions'?[...rows]:Object.keys(customers).map(id=>({user_id:id,currency:id===b?'EUR':'USD'}));
    if(table==='wallet_transactions')ledgerReads++;
    for(const [op,k,v] of q.filters){
     if(op==='eq')data=data.filter(r=>r[k]===v);if(op==='in')data=data.filter(r=>v.includes(r[k]));
     if(op==='gte')data=data.filter(r=>r[k]>=v);if(op==='lt')data=data.filter(r=>r[k]<v);if(op==='lte')data=data.filter(r=>r[k]<=v);
     if(op==='ilike')data=data.filter(r=>String(r[k]??'').toLowerCase().includes(v.slice(1,-1).replace(/\\([\\%_])/g,'$1').toLowerCase()));
    }
    if(q.cursor){const m=q.cursor.match(/^created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.([^\)]+)\)$/);assert.ok(m);assert.equal(m[1],m[2]);data=data.filter(r=>r.created_at<m[1]||(r.created_at===m[1]&&r.id<m[3]));}
    for(const [k,v] of [...q.ordering].reverse())data.sort((x,y)=>String(x[k]).localeCompare(String(y[k]))*(v.ascending?1:-1));
    if(q.limit)data=data.slice(0,Math.min(q.limit,options.databaseCap??Infinity));
    const fail=options.failTable===table||(table==='wallet_transactions'&&ledgerReads===options.failBatch);
    return Promise.resolve({data,error:fail?{message:'PRIVATE DATABASE DETAIL'}:null}).then(resolve,reject);
   }
  };return builder;
 }
 const session={auth:{getUser:async()=>({data:{user:options.loggedOut?null:{id:'admin'}}})},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:options.denied?null:{user_id:'admin'},error:options.roleError?{}:null})})};
 const admin={from,auth:{admin:{getUserById:async id=>{identityIds.push(id);return {data:{user:customers[id]??null},error:options.identityError?{status:503}:null};}}}};
 const route=load('app/admin/wallet/activity/export/route.ts',{'@/lib/supabase/admin-session':{createClient:async()=>{if(options.mfa)throw Error('redirect:/admin/login/verify');return session;}},'@/lib/supabase/admin':{createAdminClient:()=>{privileged++;return admin;}},'@/lib/business-portal':load('lib/business-portal.ts'),'@/lib/wallet-receipt':load('lib/wallet-receipt.ts')});
 return {rows,queries,identityIds,privileged:()=>privileged,get:query=>route.GET(new Request('https://www.ingamepin.com/admin/wallet/activity/export'+(query?'?'+query:'')))};
}
function parseCsv(text) {
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];if(i===0&&c==='\uFEFF')continue;
  if(c==='"'){if(quoted&&text[i+1]==='"'){cell+='"';i++;}else quoted=!quoted;}
  else if(c===','&&!quoted){row.push(cell);cell='';}
  else if(c==='\r'&&!quoted&&text[i+1]==='\n'){row.push(cell);rows.push(row);row=[];cell='';i++;}
  else cell+=c;
 }
 if(cell||row.length){row.push(cell);rows.push(row);}return rows;
}
module.exports={setup,parseCsv,makeRows,a,b};
if(require.main===module){
 test('export requires verified admin access before creating the privileged client',async()=>{
  for(const opt of [{loggedOut:true},{denied:true},{roleError:true}]){const f=setup(opt),r=await f.get();assert.ok([401,403].includes(r.status));assert.equal(f.privileged(),0);assert.match(r.headers.get('Cache-Control'),/no-store/);}
  const f=setup({mfa:true});await assert.rejects(f.get(),/redirect:/);assert.equal(f.privileged(),0);
 });
 test('complete export includes every row beyond 1000, tied timestamps and refunds exactly once',async()=>{
  const f=setup(),r=await f.get('page=8');const bytes=new Uint8Array(await r.arrayBuffer());assert.deepEqual([...bytes.slice(0,3)],[239,187,191]);
  const data=parseCsv(new TextDecoder().decode(bytes));assert.equal(data.length,1206);assert.equal(new Set(data.slice(1).map(x=>x[0])).size,1205);assert.ok(data.some(x=>x[6]==='REFUND'));
  assert.deepEqual(data.slice(1).map(x=>x[0]),[...f.rows].sort((x,y)=>y.created_at.localeCompare(x.created_at)||y.id.localeCompare(x.id)).map(x=>x.id));
  assert.equal(f.queries.filter(q=>q.table==='wallet_transactions').length,4);assert.equal(f.identityIds.length,2);
  assert.match(r.headers.get('Content-Disposition'),/attachment;.*all-customers-all-history.csv/);assert.match(r.headers.get('Content-Type'),/^text\/csv/);assert.match(r.headers.get('Cache-Control'),/private, no-store/);
 });
 test('database response caps cannot silently truncate full history',async()=>{
  const f=setup({rows:makeRows(120),databaseCap:37}),r=await f.get();const data=parseCsv(await r.text());assert.equal(data.length,121);assert.equal(new Set(data.slice(1).map(x=>x[0])).size,120);
 });
 test('customer export retains scope on every batch and uses that customer currency and balances',async()=>{
  const f=setup(),r=await f.get('customer='+b);const rows=parseCsv(await r.text());assert.equal(rows.length,403);assert.ok(rows.slice(1).every(x=>x[3]===b&&x[5]==='mary@example.com'&&x[8]==='EUR'));assert.equal(rows[1][7],'12.50');assert.equal(rows[1][9],'100.00');
  assert.ok(f.queries.filter(q=>q.table==='wallet_transactions').every(q=>q.filters.some(x=>x[1]==='user_id'&&x[2]===b)));assert.deepEqual(f.identityIds,[b]);
 });
 test('inclusive date range uses India midnight boundaries and retains type and reference filters',async()=>{
  const rows=makeRows(4).map((r,i)=>({...r,user_id:a,transaction_type:'DEBIT',reference_id:'PAY_100%\\ref',created_at:['2020-10-16T18:29:59.999Z','2020-10-16T18:30:00.000Z','2020-10-17T18:29:59.999Z','2020-10-17T18:30:00.000Z'][i]}));
  const f=setup({rows});const r=await f.get(new URLSearchParams({customer:a,from:'2020-10-17',to:'2020-10-17',type:'DEBIT',reference:'PAY_100%\\ref'}));const data=parseCsv(await r.text());assert.equal(data.length,3);assert.ok(data.slice(1).every(x=>x[1].startsWith('2020-10-17')));
  for(const q of f.queries.filter(q=>q.table==='wallet_transactions')){assert.ok(q.filters.some(x=>x[0]==='gte'&&x[2]==='2020-10-16T18:30:00.000Z'));assert.ok(q.filters.some(x=>x[0]==='lt'&&x[2]==='2020-10-17T18:30:00.000Z'));assert.ok(q.filters.some(x=>x[1]==='transaction_type'&&x[2]==='DEBIT'));assert.ok(q.filters.some(x=>x[0]==='ilike'&&x[2]==='%PAY\\_100\\%\\\\ref%'));}
 });
 test('invalid or duplicate filters are rejected instead of exporting a broader dataset',async()=>{
  for(const query of ['customer=bad','customer=','customer='+a+'&customer='+b,'from=2020-02-30','from=bad','from=2020-10-17&to=2020-10-16','to=bad','type=INVALID','from=2020-10-17&from=2020-10-18','reference='+'a'.repeat(151)]){const f=setup(),r=await f.get(query);assert.equal(r.status,400,query);assert.equal(f.privileged(),0);}
  const f=setup();assert.equal((await f.get('customer=33333333-3333-4333-8333-333333333333')).status,404);assert.equal(f.queries.length,0);
 });
 test('CSV safely handles formulas, commas, quotes, Unicode, line breaks and null fields',async()=>{
  const row={...makeRows(1)[0],user_id:a,balance_before:null,balance_after:null,description:' +SUM(1,2)\r\n"quoted"',reference_id:'@malicious',order_id:null};
  const f=setup({rows:[row],customers:{[a]:{id:a,email:'user@example.com',user_metadata:{full_name:'=HYPERLINK("bad") Тест'}}}}),r=await f.get();const data=parseCsv(await r.text());assert.equal(data.length,2);assert.equal(data[1].length,14);assert.equal(data[1][4],'\'=HYPERLINK("bad") Тест');assert.equal(data[1][11],'\' +SUM(1,2)\r\n"quoted"');assert.equal(data[1][12],"'@malicious");assert.equal(data[1][9],'');assert.equal(data[1][13],'');
 });
 test('a later batch or metadata error aborts the download instead of returning partial CSV',async()=>{
  for(const opt of [{failBatch:2},{failTable:'customer_wallets'},{identityError:true}]){const r=await setup(opt).get();await assert.rejects(r.text(),e=>/Unable to finish/.test(e.message)&&!e.message.includes('PRIVATE'));}
 });
 test('empty export still has the complete CSV header',async()=>{const r=await setup({rows:[]}).get();const data=parseCsv(await r.text());assert.equal(data.length,1);assert.equal(data[0].length,14);});
 test('transactions arriving after export begins are excluded consistently',async()=>{
  const rows=[...makeRows(2),{...makeRows(1)[0],id:'future',created_at:'2099-01-01T00:00:00.000Z'}];const f=setup({rows}),r=await f.get();assert.equal(parseCsv(await r.text()).length,3);const cutoffs=f.queries.filter(q=>q.table==='wallet_transactions').map(q=>q.filters.find(x=>x[0]==='lte')[2]);assert.equal(new Set(cutoffs).size,1);
 });
}
