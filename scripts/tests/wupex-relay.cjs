const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),crypto=require('node:crypto');
function load(file,mocks={},globals={}){
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports,require:n=>n==='server-only'?{}:n in mocks?mocks[n]:require(n),Buffer,URL,AbortSignal,Date,process,...globals});
 return exports;
}
const master='test-only-master-key-'.repeat(3);
const request={baseUrl:'https://service.wupex.com',endpoint:'/api/customer/balance',method:'GET',apiKey:'test-only-api-key'};
test('Every relay request has a fresh signature, fixed HTTPS destination, and isolated signing key',async()=>{
 const calls=[];
 const relay=load('lib/wupex-relay.ts',{}, {process:{env:{SUPABASE_SECRET_KEY:master}},fetch:async(url,options)=>{calls.push({url,options});return Response.json({status:true,data:{balance:0,currency:'USD'}})}});
 await relay.requestWupexThroughRelay(request);await relay.requestWupexThroughRelay(request);
 const subkey=Buffer.from(crypto.hkdfSync('sha256',master,'ingamepin-wupex-relay-v1','request-authentication',32));
 assert.equal(relay.deriveWupexRelayKey().toString('hex'),subkey.toString('hex'));
 assert.notEqual(calls[0].options.headers['x-wupex-nonce'],calls[1].options.headers['x-wupex-nonce']);
 for(const {url,options:o}of calls){
  assert.equal(url,'https://pally-relay.ingamepin.com/wupex/request');
  assert.equal(o.method,'POST');assert.equal(o.redirect,'error');assert.equal(o.cache,'no-store');
  assert.deepEqual(JSON.parse(o.body),request);
  const h=o.headers;assert.match(h['x-wupex-nonce'],/^[a-f0-9]{48}$/);
  assert.equal(h['x-wupex-signature'],crypto.createHmac('sha256',subkey).update(h['x-wupex-timestamp']+'\n'+h['x-wupex-nonce']+'\n'+o.body).digest('hex'));
  assert(!JSON.stringify(h).includes(master));assert(!JSON.stringify(h).includes(request.apiKey));
  assert(!JSON.stringify(h).includes(subkey.toString('hex')));
 }
});
test('Ambiguous transport errors never retry or fall back to a direct purchase',async()=>{
 let calls=0;
 const relay=load('lib/wupex-relay.ts',{}, {process:{env:{SUPABASE_SECRET_KEY:master}},fetch:async()=>{calls++;throw Error('timeout')}});
 await assert.rejects(relay.requestWupexThroughRelay({...request,endpoint:'/api/order/topup',method:'POST',body:{quantity:1}}),/timeout/);
 assert.equal(calls,1);
 const missing=load('lib/wupex-relay.ts',{}, {process:{env:{}},fetch:async()=>{throw Error('must not fetch')}});
 await assert.rejects(missing.requestWupexThroughRelay(request),/not configured/);
});
test('Authenticated API calls use the VPS relay and show only bounded firewall references',async()=>{
 let calls=0;
 const api=load('lib/wupex-api.ts',{'./wupex-relay':{requestWupexThroughRelay:async r=>{
  calls++;assert.equal(r.baseUrl,request.baseUrl);assert.equal(r.apiKey,request.apiKey);
  return Response.json({relayError:'UPSTREAM_CLOUDFLARE_BLOCK',rayId:'a50455e1c9713b0f-BOM',privateText:request.apiKey},{status:403});
 }}});
 await assert.rejects(api.getWupexBalance({...request,merchantCode:'51144'}),e=>{
  assert.match(e.message,/Cloudflare/);assert.match(e.message,/187\.127\.167\.138/);assert.match(e.message,/a50455e1c9713b0f-BOM/);assert(!e.message.includes(request.apiKey));return true;
 });assert.equal(calls,1);
 const malformed=load('lib/wupex-api.ts',{'./wupex-relay':{requestWupexThroughRelay:async()=>Response.json({relayError:'UPSTREAM_CLOUDFLARE_BLOCK',rayId:request.apiKey},{status:403})}});
 await assert.rejects(malformed.getWupexBalance({...request,merchantCode:'51144'}),e=>!e.message.includes(request.apiKey));
});
