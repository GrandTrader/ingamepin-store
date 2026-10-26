const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {NextRequest,NextResponse}=require('next/server');
function load(file,mocks){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='server-only'?{}:Object.hasOwn(mocks,n)?mocks[n]:require(n),process:{env:{}},console:{error(){}},Buffer,Date,URL,URLSearchParams,Error});return exports;}
class AccessError extends Error{constructor(message,status){super(message);this.status=status}}
const denied=async()=>{throw new AccessError('Financial transactions are restricted.',403)};
const verified={id:'real-user',email:'buyer@example.invalid',email_confirmed_at:'2026-01-01',app_metadata:{}};
function session(user=verified){return {auth:{getUser:async()=>({data:{user}})},rpc:async()=>{throw Error('Unexpected database mutation')}}}

test('financial checks bind authenticated identity and trusted context; fail closed on unavailable/malformed responses',async()=>{
 for(const [data,error,status] of [[false,null,403],[null,null,503],[true,{message:'private detail'},503],['true',null,503],[true,null,0]]){
  let call,contextReads=0;
  const api=load('lib/customer-financial-access.ts',{'next/headers':{headers:async()=>new Headers()},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(n,a)=>{call={n,a};return{data,error}}})},'@/lib/customer-purchase-access':{CustomerPurchaseAccessError:AccessError,customerPurchaseContext:async()=>{contextReads++;return{browserId:'signed-browser',ip:'192.0.2.1'}}}});
  const request=new Request('https://shop.test',{method:'POST',body:JSON.stringify({userId:'forged',ip:'forged'})});
  if(status)await assert.rejects(api.requireCustomerFinancialAccess('real-user',request),e=>e.status===status&&!e.message.includes('private detail'));
  else await api.requireCustomerFinancialAccess('real-user');
  assert.equal(call.n,'customer_financial_access');assert.equal(call.a.p_user,'real-user');assert.equal(call.a.p_browser,'signed-browser');assert.equal(call.a.p_ip,'192.0.2.1');assert.equal(contextReads,1);
  const display=await api.customerFinancialAccess('real-user');assert.equal(display.allowed,status===0);assert.equal(contextReads,1);
 }
});

test('all wallet top-up gateways reject blocked customers before invoices, requests or expiry writes',async()=>{
 const route=load('app/api/wallet/topup/route.ts',{
  'next/server':{NextRequest,NextResponse},'@/lib/customer-financial-access':{requireCustomerFinancialAccess:denied},'@/lib/customer-purchase-access':{CustomerPurchaseAccessError:AccessError},
  '@/lib/supabase/server':{createClient:async()=>session()},'@/lib/supabase/admin':{createAdminClient:()=>{throw Error('Unexpected admin access')}},
  '@/lib/wallet-payment-gateways':{isWalletGatewayId:()=>true,getWalletPaymentGateways:()=>['PALLY','FREEKASSA','BINANCE_PAY','USDT_DIRECT'].map(id=>({id}))},
  '@/lib/wallet-topup-expiry':{expireStaleWalletTopups:async()=>{throw Error('Unexpected mutation')}},
  '@/lib/binance-pay':{},'@/lib/freekassa':{},'@/lib/pally':{},'@/lib/usdt-gateway':{},'@/lib/payment-gateway-commissions':{},'@/lib/wallet-admin-notification':{},
 });
 for(const gateway of ['PALLY','FREEKASSA','BINANCE_PAY','USDT_DIRECT']){
  const response=await route.POST(new NextRequest('https://shop.test/api/wallet/topup',{method:'POST',body:JSON.stringify({amount:25,gateway,network:'BEP20',userId:'forged'})}));
  assert.equal(response.status,403);assert.match((await response.json()).error,/Financial transactions/);
 }
});

test('legacy Binance payment creation cannot bypass the financial restriction',async()=>{
 let checks=0;
 const route=load('app/api/binance-pay/wallet/create-order/route.ts',{'next/server':{NextRequest,NextResponse},'@/lib/customer-financial-access':{requireCustomerFinancialAccess:async(id)=>{assert.equal(id,'real-user');checks++;await denied()}},'@/lib/customer-purchase-access':{CustomerPurchaseAccessError:AccessError},'@/lib/supabase/server':{createClient:async()=>session()},'@/lib/supabase/admin':{createAdminClient:()=>{throw Error('Unexpected lookup')}},'@/lib/binance-pay':{callBinancePay:async()=>{throw Error('Unexpected provider invoice')}}});
 const response=await route.POST(new NextRequest('https://shop.test/api/binance-pay/wallet/create-order',{method:'POST',body:JSON.stringify({requestId:'old-request'})}));assert.equal(response.status,403);assert.equal(checks,1);
});

test('legacy top-ups, refund claims, withdrawals and cancellation stop before database mutation',async()=>{
 const redirects=[];
 const common={'next/cache':{revalidatePath:()=>{throw Error('Unexpected refresh')}},'next/navigation':{redirect:url=>{redirects.push(url);throw Error('REDIRECT')}},'@/lib/supabase/server':{createClient:async()=>session()},'@/lib/customer-financial-access':{requireCustomerFinancialAccess:denied}};
 const actions=load('app/account/wallet/actions.ts',common);
 const withdrawals=load('app/account/wallet/withdrawal-actions.ts',{...common,'@/lib/wallet-receipt':{},'@/lib/wallet-withdrawals':{}});
 const form=new FormData();form.set('amount','25');form.set('refund_id','00000000-0000-4000-8000-000000000001');
 for(const action of [actions.startBinanceWalletTopup,actions.claimWalletRefund,withdrawals.requestWithdrawal,withdrawals.cancelWithdrawal]){
  await assert.rejects(action(form),/REDIRECT/);assert.match(decodeURIComponent(redirects.at(-1)).replaceAll('+',' '),/Financial transactions are restricted/);
 }
});

test('bank transfer access rejects restriction before checking or using KYB permission',async()=>{
 const access=load('lib/business-bank-access.ts',{'@/lib/customer-financial-access':{requireCustomerFinancialAccess:denied},'@/lib/supabase/admin':{createAdminClient:()=>{throw Error('Unexpected bank lookup')}}});
 await assert.rejects(access.requireBusinessBankTransfer('real-user'),e=>e.status===403);
});
