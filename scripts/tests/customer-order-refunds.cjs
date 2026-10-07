const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, deps={}) {
  const exports={};
  const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  vm.runInNewContext(code,{exports,Error,require:name=>{if(name in deps)return deps[name];throw Error('Unmocked '+name);}});return exports;
}
const logic=load('lib/order-refund-request.ts');
const order='00000000-0000-4000-8000-000000000001', user='00000000-0000-4000-8000-000000000002';
function form(fields={}) {const f=new FormData();for(const [k,v] of Object.entries({order_id:order,method:'WALLET',reason:'No longer needed',...fields}))f.set(k,v);return f;}
test('refund choices follow original gateway while keeping wallet common to every gateway',()=>{
 for(const original of ['PALLY','FREEKASSA','UPI','PAYTM']) {
  const methods=Array.from(logic.refundMethods({[original]:{enabled:false}},original));
  assert.deepEqual(methods,['WALLET',original]);
 }
 assert.deepEqual(Array.from(logic.refundMethods({},'WALLET')),['WALLET']);
 for(const original of ['BINANCE_PAY','USDT_DIRECT']) {
  assert.deepEqual(Array.from(logic.refundMethods({},original)),['WALLET','BINANCE_PAY','USDT_DIRECT']);
  const other=original==='BINANCE_PAY'?'USDT_DIRECT':'BINANCE_PAY';
  assert.deepEqual(Array.from(logic.refundMethods({[other]:{enabled:false},[original]:{enabled:false}},original)),['WALLET',original]);
 }
 assert.deepEqual(Array.from(logic.refundMethods({},'UNKNOWN')),['WALLET']);
});
test('customer cannot submit arbitrary references, methods or unbounded text',()=>{
  for(const fields of [{order_id:'wrong'},{method:'BANK_UNSUPPORTED'},{reason:'x'},{reason:'x'.repeat(1001)},{details:'x'.repeat(1001)}])assert.throws(()=>logic.parseRefundRequest(form(fields)));
});
function customerHarness({denied=false,rpcError=null,emailError=false}={}) {
 const calls=[];
 const api=load('app/account/orders/refund-actions.ts',{
  'next/cache':{revalidatePath:path=>calls.push(['revalidate',path])},
  '@/lib/customer-account-data':{requireCustomer:async()=>{calls.push(['auth']);if(denied)throw Error('denied');return {user:{id:user}};}},
  '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {data:order,error:rpcError};}})},
  '@/lib/order-refund-request':logic,
  '@/lib/email':{SUPPORT_EMAIL:'support@ingamepin.com',sendEmail:async message=>{calls.push(['email',message]);if(emailError)throw Error('SMTP offline');return {rejected:[]};}},
 });return {api,calls};
}
test('customer action authenticates first and takes identity only from session',async()=>{
 const h=customerHarness();assert.equal((await h.api.requestOrderRefund(form({customer_id:'attacker'}))).success,true);
 assert.equal(h.calls[0][0],'auth');assert.equal(h.calls.find(c=>c[0]==='rpc')[2].p_customer_id,user);
 const d=customerHarness({denied:true});await assert.rejects(()=>d.api.requestOrderRefund(form()),/denied/);assert.equal(d.calls.length,1);
});
test('customer validation and RPC failures never report success',async()=>{
 const h=customerHarness();assert.ok((await h.api.requestOrderRefund(form({method:'x'}))).error);assert.ok(!h.calls.some(c=>c[0]==='rpc'));
 const e=customerHarness({rpcError:{code:'XX',message:'private backend details'}});const result=await e.api.requestOrderRefund(form());assert.ok(result.error);assert.ok(!result.error.includes('private'));assert.ok(!e.calls.some(c=>c[0]==='revalidate'));assert.ok(!e.calls.some(c=>c[0]==='email'));
});
function adminHarness({denied=false}={}) {
 const calls=[];const chain={select(){return chain;},eq(){return chain;},async maybeSingle(){return {data:{order_id:order},error:null};}};
 const api=load('app/admin/refund-requests/actions.ts',{
  'next/cache':{revalidatePath:path=>calls.push(['revalidate',path])},
  '@/lib/order-refund-data':{requireRefundAdmin:async()=>{calls.push(['auth']);if(denied)throw Error('denied');return {id:user};}},
  '@/lib/order-refund-request':logic,
  '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>chain,rpc:async(name,args)=>{calls.push(['rpc',name,args]);return {data:'COMPLETED',error:null};}})},
 });return {api,calls};
}
test('admin action requires admin authentication before reading request or issuing refund',async()=>{
 const h=adminHarness({denied:true});await assert.rejects(()=>h.api.reviewOrderRefund(form({request_id:order,action:'APPROVE'})),/denied/);assert.equal(h.calls.length,1);
});
test('external refund completion requires explicit confirmation and transaction reference',async()=>{
 for(const fields of [{reference:'TX-123'},{confirmed:'on'},{confirmed:'on',reference:'x'}]){
  const h=adminHarness();assert.ok((await h.api.reviewOrderRefund(form({request_id:order,action:'COMPLETE',...fields}))).error);assert.ok(!h.calls.some(c=>c[0]==='rpc'));
 }
 const h=adminHarness();assert.equal((await h.api.reviewOrderRefund(form({request_id:order,action:'COMPLETE',reference:'TX-123',confirmed:'on',admin_id:'attacker'}))).status,'COMPLETED');assert.equal(h.calls.find(c=>c[0]==='rpc')[2].p_admin_id,user);
});

test('crypto refund networks preserve the selected network and trimmed address',()=>{
 for(const [network,label,address] of [
  ['TRC20','TRON (TRC20)','T'+'A'.repeat(33)],
  ['BEP20','BNB Smart Chain (BEP20)','0x'+'a'.repeat(40)],
  ['SOLANA','Solana','A'.repeat(44)],
 ]) {
  const result=logic.parseRefundRequest(form({method:'USDT_DIRECT',network,wallet_address:' '+address+' ',details:'stale details'}));
  assert.equal(result.details,`Network: ${label}\nWallet address: ${address}`);
 }
});
test('crypto refunds reject missing or mismatched network and address before issuing a request',async()=>{
 for(const fields of [
  {},{network:'ERC20',wallet_address:'0x'+'a'.repeat(40)},
  {network:'TRC20'},{network:'TRC20',wallet_address:'0x'+'a'.repeat(40)},
  {network:'BEP20',wallet_address:'0x123'},
  {network:'SOLANA',wallet_address:'0'.repeat(44)},
 ]) {
  const h=customerHarness();
  const result=await h.api.requestOrderRefund(form({method:'USDT_DIRECT',...fields}));
  assert.ok(result.error);assert.ok(!h.calls.some(c=>c[0]==='rpc'));
 }
});
test('customer action stores the crypto network and address in payout details',async()=>{
 const h=customerHarness(),address='0x'+'b'.repeat(40);
 assert.equal((await h.api.requestOrderRefund(form({method:'USDT_DIRECT',network:'BEP20',wallet_address:address}))).success,true);
 assert.equal(h.calls.find(c=>c[0]==='rpc')[2].p_details,`Network: BNB Smart Chain (BEP20)\nWallet address: ${address}`);
});
test('other refund methods retain receiving details without requiring a crypto network',()=>{
 assert.equal(logic.parseRefundRequest(form({method:'UPI',details:' customer@upi ',network:'invalid',wallet_address:'stale'})).details,'customer@upi');
 assert.equal(logic.parseRefundRequest(form()).details,'');
});

test('refund network fee schedule matches the configured dollar fees',()=>{
 for(const [network,fee] of [['TRC20',4.5],['SOLANA',2.5],['BEP20',0.5],['OTHER',3.5]]) {
  assert.equal(logic.CRYPTO_REFUND_NETWORKS.find(n=>n.value===network).feeUsd,fee);
 }
});
test('other crypto networks require a clear network name and receiving address',()=>{
 for(const fields of [{},{other_network:'x'},{other_network:'TRON (TRC20)'},{other_network:'Solana'},{other_network:'BSC BEP20'},{other_network:'Ethereum\nNetwork: TRC20'},{other_network:'Ethereum',wallet_address:''}]) {
  assert.throws(()=>logic.parseRefundRequest(form({method:'USDT_DIRECT',network:'OTHER',wallet_address:'0x'+'a'.repeat(40),...fields})));
 }
 const address='0x'+'a'.repeat(40);
 assert.equal(logic.parseRefundRequest(form({method:'USDT_DIRECT',network:'OTHER',other_network:'Ethereum (ERC20)',wallet_address:address})).details,`Network: Ethereum (ERC20)\nWallet address: ${address}`);
});


test('refund quote deducts exact network fees and leaves noncrypto methods fee free',()=>{
 for(const [network,net] of [['TRC20',95.5],['SOLANA',97.5],['BEP20',99.5],['OTHER',96.5]]) {
  const result=logic.refundQuote(100,'USD','USDT_DIRECT',network);assert.equal(result.net,net);assert.equal(result.error,'');
 }
 for(const method of ['PALLY','FREEKASSA','WALLET','BINANCE_PAY','UPI','PAYTM']) {
  const result=logic.refundQuote(100,'USD',method,'TRC20');assert.equal(result.fee,0);assert.equal(result.net,100);
 }
 assert.equal(logic.refundQuote(4.51,'USD','USDT_DIRECT','TRC20').net,0.01);
 for(const args of [[4.5,'USD','USDT_DIRECT','TRC20'],[1,'USD','USDT_DIRECT','TRC20'],[100,'USD','USDT_DIRECT',''],[100,'INR','USDT_DIRECT','TRC20']]) assert.ok(logic.refundQuote(...args).error);
});
test('server sends the validated network, never a browser-supplied fee or refund amount',async()=>{
 const h=customerHarness();await h.api.requestOrderRefund(form({method:'USDT_DIRECT',network:'TRC20',wallet_address:'T'+'A'.repeat(33),network_fee:'0',net_amount:'99999'}));
 const args=h.calls.find(c=>c[0]==='rpc')[2];assert.equal(args.p_network,'TRC20');assert.equal(args.network_fee,undefined);assert.equal(args.net_amount,undefined);
});


test('per-order refund switch requires admin session and strict order/enabled values',async()=>{
 const denied=adminHarness({denied:true});await assert.rejects(()=>denied.api.setOrderRefundPermission(form({enabled:'true'})),/denied/);assert.equal(denied.calls.length,1);
 for(const fields of [{enabled:'on'},{enabled:'true',order_id:'invalid'}]) {
  const h=adminHarness();assert.ok((await h.api.setOrderRefundPermission(form(fields))).error);assert.ok(!h.calls.some(c=>c[0]==='rpc'));
 }
 for(const enabled of ['true','false']) {
  const h=adminHarness();await h.api.setOrderRefundPermission(form({enabled,admin_id:'attacker'}));
  const args=h.calls.find(c=>c[0]==='rpc');assert.equal(args[1],'set_order_refund_permission');assert.equal(args[2].p_admin_id,user);assert.equal(args[2].p_order_id,order);assert.equal(args[2].p_enabled,enabled==='true');
  assert.ok(h.calls.some(c=>c[0]==='revalidate'&&c[1]===`/account/orders/${order}`));
 }
});

test('refund enquiries notify support after saving and SMTP failure does not invalidate the request',async()=>{
 for(const emailError of [false,true]){const h=customerHarness({emailError});assert.equal((await h.api.requestOrderRefund(form())).success,true);const index=h.calls.findIndex(c=>c[0]==='email');assert(index>h.calls.findIndex(c=>c[0]==='rpc'));assert.equal(h.calls[index][1].to,'support@ingamepin.com');assert(!h.calls[index][1].text.includes('payout_details'));}
});
