const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), crypto = require('node:crypto');
const secret = 'test-private-secret-'.repeat(3);
function harness(result='null', status=200) {
 const calls=[], exports={};
 const code=ts.transpileModule(fs.readFileSync('app/api/internal/supplier-database/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,require:n=>{assert.equal(n,'node:crypto');return crypto;},Buffer,Response,AbortSignal,
  process:{env:{DEFINITEPLAY_RELAY_SECRET:secret,GIFTPORT_RELAY_SECRET:secret,NEXT_PUBLIC_SUPABASE_URL:'https://db.example.test',SUPABASE_SECRET_KEY:'db-private'}},
  fetch:async(url,init)=>{calls.push({url,init});return new Response(init.method==='HEAD'?null:result,{status});}});
 return {api:exports,calls};
}
function request(body, {provider='DEFINITEPLAY', stamp=String(Math.floor(Date.now()/1000)), sign=true, method='POST'}={}) {
 const raw=method==='GET'?'':JSON.stringify(body);
 const headers={'content-type':'application/json','x-supplier-provider':provider,'x-supplier-time':stamp};
 if(sign) headers['x-supplier-signature']=crypto.createHmac('sha256',secret).update(['supplier-database-v1',provider,method,stamp,crypto.createHash('sha256').update(raw).digest('hex')].join('\n')).digest('hex');
 return new Request('https://www.ingamepin.com/api/internal/supplier-database',{method,headers,...(method==='GET'?{}:{body:raw})});
}
test('rejects unsigned, expired, altered, and unknown provider requests before database access',async()=>{
 const {api,calls}=harness();
 for(const options of [{sign:false},{stamp:'1000000000'},{provider:'OTHER'}]) assert.equal((await api.POST(request({name:'claim_definiteplay_job',args:{}},options))).status,401);
 const changed=request({name:'claim_definiteplay_job',args:{}}); changed.headers.set('x-supplier-signature','0'.repeat(64));
 assert.equal((await api.POST(changed)).status,401); assert.equal(calls.length,0);
});
test('only exact provider operations and argument sets are accepted',async()=>{
 const {api,calls}=harness();
 for(const body of [{name:'delete_all_orders',args:{}},{name:'constructor',args:{}},{name:'claim_definiteplay_job',args:{p_sql:'bad'}},{name:'claim_supplier_job',args:{p_provider:'DEFINITEPLAY'}}])
  assert.equal((await api.POST(request(body))).status,400);
 assert.equal(calls.length,0);
});
test('health is authenticated and read-only',async()=>{
 const {api,calls}=harness(); assert.equal((await api.GET(request(null,{method:'GET',sign:false}))).status,401);
 const response=await api.GET(request(null,{method:'GET'})); assert.deepEqual(await response.json(),{ready:true});
 assert.equal(calls.length,1); assert.equal(calls[0].init.method,'HEAD'); assert.match(calls[0].url,/limit=0$/);
});
test('forwards one allowlisted RPC with no retries, preserving numeric precision',async()=>{
 const {api,calls}=harness('0.123456789123456789');
 const response=await api.POST(request({name:'sync_definiteplay_stock',args:{p_rows:[],p_synced_at:'2026-10-06T00:00:00Z'}}));
 assert.equal(await response.text(),'0.123456789123456789'); assert.equal(calls.length,1);
 assert.match(calls[0].url,/rpc\/sync_definiteplay_stock$/); assert.equal(calls[0].init.redirect,'error');
 assert.match(response.headers.get('cache-control'),/no-store/);
});
test('hides database error details and does not retry an ambiguous failure',async()=>{
 const {api,calls}=harness('private customer details',500);
 const response=await api.POST(request({name:'mark_definiteplay_submitted',args:{p_item_id:'id',p_token:'token'}}));
 assert.equal(response.status,502); assert.ok(!(await response.text()).includes('private customer')); assert.equal(calls.length,1);
});
test('rejects oversized request even with declared signature',async()=>{
 const {api,calls}=harness(); const req=request({name:'claim_definiteplay_job',args:{}}); req.headers.set('content-length',String(3*1024*1024));
 assert.equal((await api.POST(req)).status,413); assert.equal(calls.length,0);
});

test('retired GiftPort requests are rejected even with a valid old signature',async()=>{
 const {api,calls}=harness();
 assert.equal((await api.GET(request(null,{provider:'GIFTPORT',method:'GET'}))).status,401);
 assert.equal((await api.POST(request({name:'claim_supplier_job',args:{p_provider:'GIFTPORT'}},{provider:'GIFTPORT'}))).status,401);
 assert.equal(calls.length,0);
});
