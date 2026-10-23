const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const crypto=require('node:crypto'),{NextRequest,NextResponse}=require('next/server');
const order='00000000-0000-4000-8000-000000000001';
function route(provider,method,extra={},env={}){
 const state={queries:[],calls:[],deliveries:0};
 const payment={id:'payment',order_id:order,status:'PENDING',gateway_order_id:provider==='freekassa'?order:provider==='nowpayments'?'12':'old-reference',gateway_payment_id:'100'};
 const db={from:table=>{state.queries.push(table);const q={select(){return q},eq(){return q},update(){return q},maybeSingle:async()=>({data:payment}),then(ok){return Promise.resolve({error:null}).then(ok)}};return q;},rpc:async(name,args)=>{state.calls.push({name,args});return{data:{requiresReview:true}}}};
 const mocks={'next/server':{NextRequest,NextResponse},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/email':{},'@/lib/payment-failure-sync':{},
 '@/lib/manual-fulfillment':{prepareOrderForManualFulfillment:async()=>{state.deliveries++}},'@/lib/telegram-order-notification':{},'@/lib/digiseller-usdt':{},'@/lib/digiseller-binance-pay':{},...extra};
 const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/'+provider+'/webhook/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports,require:n=>n in mocks?mocks[n]:require(n),Buffer,URL,Date,console,process:{env}});
 return{state,send:(body,headers)=>exports.POST(new NextRequest('https://shop.test/api/'+provider+'/webhook',{method:'POST',body,headers})),verify(){assert(state.queries.includes('checkout_gateway_payments'));assert.equal(state.calls.at(-1).name,'complete_checkout_attempt');assert.equal(state.calls.at(-1).args.p_method,method);assert.equal(state.deliveries,0);}};
}
test('Pally verifies signed provider payment before holding a replaced invoice without fulfillment',async()=>{
 const f=route('pally','PALLY',{'@/lib/pally':{getPallyApiToken:()=> 'secret',getPallyBillStatus:async()=>({id:'old-reference',order_id:order,status:'SUCCESS',currency_in:'RUB',amount:'100'})}});
 const send=signature=>f.send(new URLSearchParams({InvId:order,OutSum:'100',CurrencyIn:'RUB',Status:'SUCCESS',TrsId:'paid',SignatureValue:signature}));
 assert.equal((await send('bad')).status,401);assert.equal(f.state.calls.length,0);
 assert.equal((await send(crypto.createHash('md5').update('100:'+order+':secret').digest('hex'))).status,200);f.verify();
});
test('Direct USDT validates both signed callback and provider invoice before holding replaced payment',async()=>{
 const invoice={invoiceId:'old-reference',orderId:order,status:'PAID',transactionHash:'hash',amount:'10',network:'TRC20'};
 const f=route('usdt','USDT_DIRECT',{'@/lib/usdt-gateway':{getUsdtInvoice:async()=>invoice}},{USDT_GATEWAY_CALLBACK_SECRET:'secret'});
 const raw=JSON.stringify(invoice),time=String(Math.floor(Date.now()/1000));
 const send=s=>f.send(raw,{'x-gateway-timestamp':time,'x-gateway-signature':s});
 assert.equal((await send('bad')).status,401);assert.equal(f.state.calls.length,0);
 assert.equal((await send(crypto.createHmac('sha256','secret').update(time+'.'+raw).digest('hex'))).status,200);f.verify();
});
test('NOWPayments signed success routes the original invoice to attempt settlement',async()=>{
 const f=route('nowpayments','NOWPAYMENTS',{}, {NOWPAYMENTS_IPN_SECRET:'secret'});
 const raw=JSON.stringify({invoice_id:12,order_id:order,payment_id:34,payment_status:'finished'});
 const send=s=>f.send(raw,{'x-nowpayments-sig':s});assert.equal((await send('bad')).status,401);assert.equal(f.state.calls.length,0);
 assert.equal((await send(crypto.createHmac('sha512','secret').update(raw).digest('hex'))).status,200);f.verify();
});
test('FreeKassa authenticates the callback and uses historical invoice amount before holding it',async()=>{
 let valid=false;const f=route('freekassa','FREEKASSA',{'@/lib/freekassa':{verifyFreeKassaNotification:()=>valid}});
 const send=()=>f.send(new URLSearchParams({MERCHANT_ID:'shop',AMOUNT:'100',MERCHANT_ORDER_ID:order,intid:'paid',SIGN:'signed'}),{'x-forwarded-for':'168.119.157.136'});
 assert.equal((await send()).status,401);assert.equal(f.state.calls.length,0);valid=true;assert.equal((await send()).status,200);f.verify();
});
test('Binance verifies signature and paid invoice before routing a replaced payment for review',async()=>{
 const keys=crypto.generateKeyPairSync('rsa',{modulusLength:2048});
 const f=route('binance-pay','BINANCE_PAY',{'@/lib/binance-pay':{callBinancePay:async(path)=>path.endsWith('/certificates')?[{certSerial:'fixture',certPublic:keys.publicKey.export({type:'spki',format:'pem'})}]:{prepayId:'old-reference',merchantTradeNo:'trade',status:'PAID',transactionId:'paid'}}});
 const raw=JSON.stringify({bizType:'PAY',bizStatus:'PAY_SUCCESS',data:{prepayId:'old-reference',merchantTradeNo:'trade'}}),time=String(Date.now()),nonce='fixture';
 const send=s=>f.send(raw,{'BinancePay-Timestamp':time,'BinancePay-Nonce':nonce,'BinancePay-Certificate-SN':'fixture','BinancePay-Signature':s});
 assert.equal((await send('bad')).status,401);assert.equal(f.state.calls.length,0);
 assert.equal((await send(crypto.sign('RSA-SHA256',Buffer.from(time+'\n'+nonce+'\n'+raw+'\n'),keys.privateKey).toString('base64'))).status,200);f.verify();
});
