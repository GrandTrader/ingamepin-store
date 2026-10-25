const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {NextRequest,NextResponse}=require('next/server');
function load(file,mocks={},env={}) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{
  exports,require:n=>n==='server-only'?{}:n in mocks?mocks[n]:require(n),process:{env},console,Buffer
 });
 return exports;
}
test('Customer and scheduled cleanup use the atomic database operation with explicit scope',async()=>{
 const calls=[];
 const f=load('lib/wallet-topup-expiry.ts',{'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push([name,args.p_user_id]);return{data:3,error:null}}})}});
 assert.equal(await f.expireStaleWalletTopups('customer'),3);
 assert.equal(await f.expireStaleWalletTopups(),3);
 assert.deepEqual(calls,[['reject_stale_wallet_topups','customer'],['reject_stale_wallet_topups',null]]);
});
test('Database errors are reported without leaking internal details',async()=>{
 const f=load('lib/wallet-topup-expiry.ts',{'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async()=>({error:{message:'private database detail'}})})}});
 await assert.rejects(f.expireStaleWalletTopups(),e=>e.message==='Unable to reject old wallet top-ups.');
});
test('Scheduler authenticates before wallet mutations, sweeps without page visits, and reports only counts',async()=>{
 const calls=[];let fail=false;
 const secret='fixture-secret-with-more-than-24-characters';
 const route=load('app/api/cron/payment-status/route.ts',{
  'next/server':{NextRequest,NextResponse},
  '@/lib/wallet-topup-expiry':{expireStaleWalletTopups:async()=>{calls.push('wallet');if(fail)throw Error('database private');return 2}},
  '@/lib/checkout-payment-session':{expireUnpaidCheckouts:async()=>{calls.push('checkout');return 1}},
  '@/lib/payment-failure-sync':{syncFailedGatewayPayments:async()=>{calls.push('sync');return{checked:0,releasedOrderIds:[],failed:0}}}
 },{CRON_SECRET:secret});
 const request=auth=>new NextRequest('https://test.invalid/api/cron/payment-status',{headers:{authorization:auth}});
 assert.equal((await route.GET(request('wrong'))).status,401);assert.equal(calls.length,0);
 const result=await route.GET(request('Bearer '+secret));
 assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'no-store');
 assert.equal((await result.json()).walletTopupsRejected,2);assert.deepEqual(calls,['wallet','checkout','sync']);
 calls.length=0;fail=true;const error=await route.GET(request('Bearer '+secret));assert.equal(error.status,503);
 assert.equal(JSON.stringify(await error.json()).includes('private'),false);assert.deepEqual(calls,['wallet']);
});

test('Terminal status polling stays private and works even when the crypto gateway is offline',async()=>{
 for(const status of ['REJECTED','EXPIRED','APPROVED','PENDING']) {
  const filters=[];let providerCalls=0;
  const q={select(){return q},eq(k,v){filters.push([k,v]);return q},maybeSingle:async()=>({data:{id:'request',status,payment_method:'USDT_DIRECT',gateway_order_id:'invoice',gateway_transaction_id:null}})};
  const r=load('app/api/wallet/topup/status/route.ts',{
   'next/server':{NextRequest,NextResponse},
   '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'customer'}}})},from:()=>q})},
   '@/lib/usdt-gateway':{getUsdtInvoice:async()=>{providerCalls++;throw Error('offline')}}
  });
  const result=await r.GET(new NextRequest('https://test.invalid/api/wallet/topup/status?requestId=request'));
  assert(filters.some(([k,v])=>k==='user_id'&&v==='customer'));
  if(status==='PENDING'){assert.equal(providerCalls,1);assert.equal(result.status,500);}
  else {assert.equal(providerCalls,0);assert.equal((await result.json()).topupStatus,status);}
 }
});
test('Crypto payment UI clears instructions and leaves closed requests without requiring an invoice',async()=>{
 for(const portal of [false,true]) for(const status of ['REJECTED','EXPIRED','APPROVED']) {
  let check;const routes=[],states=[];
  const f='app/account/wallet/usdt/[id]/WalletUsdtPayment.tsx',exports={};
  const mocks={
   react:{useCallback:f=>{check=f;return f},useEffect(){},useMemo:f=>f(),useState:v=>[typeof v==='function'?v():v,x=>states.push(x)]},
   'next/navigation':{usePathname:()=>portal?'/account/portal/wallet/usdt/id':'/account/wallet/usdt/id',useRouter:()=>({replace:x=>routes.push(x)})}
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{
   exports,require:n=>n in mocks?mocks[n]:n.startsWith('@/components/')?{default:()=>null}:require(n),console,
   fetch:async()=>({ok:true,json:async()=>({topupStatus:status})})
  });
  exports.default({requestId:'request'});await check();
  assert.equal(states[0],null);assert.equal(routes.length,1);
  assert(routes[0].startsWith(portal?'/account/portal/wallet?':'/account/wallet?'));
  assert(routes[0].includes(status==='APPROVED'?'success=':'error='));
 }
});
