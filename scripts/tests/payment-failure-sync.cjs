const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {NextRequest,NextResponse}=require('next/server');
function load(file,mocks={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='server-only'?{}:n in mocks?mocks[n]:require(n),process:{env:{NOWPAYMENTS_API_KEY:'fixture'}},console,Buffer,URL,Date,AbortSignal,...globals});return exports;}
const payment={id:'payment',order_id:'00000000-0000-4000-8000-000000000001',method:'PALLY',gateway_order_id:'reference',gateway_payment_id:'100',amount:10,currency:'USD'};
function fixture(opts={}){
 const rpc=[],updates=[],filters=[];
 const db={rpc:async(name,args)=>{rpc.push({name,args});return opts.rpcError?{error:{message:'failed'}}:{data:{released:opts.release!==false}};},from(table){
  const q={select(){return q},eq(...a){filters.push(a);return q},in(){return q},not(){return q},order(){return q},limit(){return q},or(){return q},update(row){updates.push(row);q.write=true;return q},maybeSingle(){return Promise.resolve({data:opts.checkout??{payment_id:payment.id,paypal_order_id:payment.gateway_order_id,capture_id:null}})},then(resolve,reject){return Promise.resolve(q.write?{error:null}:{data:opts.payments??[payment],error:opts.queryError?{}:null}).then(resolve,reject)}};return q;}};
 const mod=load('lib/payment-failure-sync.ts',{
  '@/lib/supabase/admin':{createAdminClient:()=>db},
  '@/lib/pally':{getPallyBillStatus:async()=>{if(opts.offline)throw Error('offline');return opts.bill??{id:'reference',order_id:payment.order_id,currency_in:'RUB',status:'FAIL'}}},
  '@/lib/freekassa':{getFreeKassaOrders:async()=>opts.fk??{pages:1,orders:[]}},
  '@/lib/binance-pay':{callBinancePay:async()=>opts.binance},
  '@/lib/paypal':{paypalRequest:async()=>opts.paypal},
  '@/lib/paypal-checkout':{paypalLiveConfiguration(){},verifyPayPalOrder:(o)=>o.purchase_units[0]},
 },{fetch:async url=>({ok:true,json:async()=>url.includes('/payment/?')?opts.nowList:opts.now}),
 process:{env:{NOWPAYMENTS_API_KEY:'fixture',...(opts.nowJwt?{NOWPAYMENTS_JWT_TOKEN:'fixture-jwt'}:{})}}});
 return {...mod,rpc,updates,filters};
}
test('Pally terminal failure is independently verified and released atomically',async()=>{const f=fixture(),r=await f.syncFailedGatewayPayments();assert.equal(r.releasedOrderIds[0],payment.order_id);assert.equal(f.rpc[0].name,'fail_unpaid_gateway_payment');assert.equal(f.rpc[0].args.p_gateway_status,'FAIL');assert(f.filters.some(a=>a[0]==='status'&&a[1]==='PENDING'));});
test('pending, paid, partial, unknown, mismatched, unavailable states do not release',async()=>{for(const state of ['NEW','PROCESS','SUCCESS','UNDERPAID','OVERPAID','UNKNOWN']){const f=fixture({bill:{id:'reference',order_id:payment.order_id,currency_in:'RUB',status:state}});await f.syncFailedGatewayPayments();assert.equal(f.rpc.length,0,state);}for(const opts of [{offline:true},{bill:{id:'wrong',order_id:payment.order_id,currency_in:'RUB',status:'FAIL'}},{bill:{id:'reference',order_id:'wrong',currency_in:'RUB',status:'FAIL'}}]){const f=fixture(opts);const r=await f.syncFailedGatewayPayments();assert.equal(r.failed,1);assert.equal(f.rpc.length,0);}});
test('failed database writes never report released quota; concurrent paid rows remain protected',async()=>{for(const opts of [{rpcError:true},{release:false}]){const f=fixture(opts),r=await f.syncFailedGatewayPayments();assert.equal(r.releasedOrderIds.length,0);}});
test('FreeKassa requires every matching attempt to fail and checks amount, currency, and pagination',async()=>{const p={...payment,method:'FREEKASSA',gateway_order_id:payment.order_id};const row={merchant_order_id:p.order_id,amount:100,currency:'RUB',status:9};
 for(const [orders,pages,expected]of [[[row],1,true],[[row,{...row,status:8}],1,true],[[row,{...row,status:1}],1,false],[[row,{...row,status:0}],1,false],[[],1,false],[[row],2,false]]){
  assert.equal((await fixture({fk:{pages,orders}}).verifiedGatewayFailure(p)).unpaidFailure,expected);
 }
 await assert.rejects(fixture({fk:{pages:1,orders:[{...row,amount:1}]}}).verifiedGatewayFailure(p));
});
test('Binance only releases expired/canceled matching orders without a payment transaction',async()=>{for(const [state,tx,expected]of [['EXPIRED',null,true],['CANCELED',null,true],['ERROR',null,false],['PAID','paid',false],['EXPIRED','paid',false],['PENDING',null,false]]){const order={prepayId:'reference',merchantTradeNo:payment.order_id.replaceAll('-',''),status:state,transactionId:tx};assert.equal((await fixture({binance:order}).verifiedGatewayFailure({...payment,method:'BINANCE_PAY'})).unpaidFailure,expected);}await assert.rejects(fixture({binance:{prepayId:'wrong'}}).verifiedGatewayFailure({...payment,method:'BINANCE_PAY'}));});
test('NOWPayments never releases partial funds, missing amounts, or other invoices',async()=>{const p={...payment,method:'NOWPAYMENTS',gateway_order_id:'12',gateway_payment_id:'34'};const row={payment_id:34,invoice_id:12,order_id:p.order_id,payment_status:'expired',actually_paid:0};
 for(const [paid,expected]of [[0,true],['0',true],[1,false],[null,false],[undefined,false],['',false]])assert.equal((await fixture({now:{...row,actually_paid:paid},nowJwt:true,nowList:{pagesCount:1,data:[{...row,actually_paid:paid}]}}).verifiedGatewayFailure(p)).unpaidFailure,expected);
 assert.equal((await fixture({now:row}).verifiedGatewayFailure(p)).unpaidFailure,false,'Without invoice-wide proof the order remains held');
 for(const nowList of [{pagesCount:2,data:[row]},{pagesCount:1,data:[]},{pagesCount:1,data:[row,{...row,payment_id:35,actually_paid:1,payment_status:'partially_paid'}]},{pagesCount:1,data:[row,{...row,payment_id:35,payment_status:'waiting'}]}])
   assert.equal((await fixture({now:row,nowJwt:true,nowList}).verifiedGatewayFailure(p)).unpaidFailure,false);
 assert.equal((await fixture({now:{...row,payment_status:'partially_paid'}}).verifiedGatewayFailure(p)).unpaidFailure,false);
 await assert.rejects(fixture({now:{...row,invoice_id:99}}).verifiedGatewayFailure(p));
 assert.equal((await fixture().verifiedGatewayFailure({...p,gateway_payment_id:null})).unpaidFailure,false);
});
test('PayPal only releases voided orders with no captures or authorizations',async()=>{for(const [state,payments,expected]of [['VOIDED',{},true],['APPROVED',{},false],['VOIDED',{captures:[{status:'COMPLETED'}]},false],['VOIDED',{authorizations:[{status:'CREATED'}]},false]]){assert.equal((await fixture({paypal:{status:state,purchase_units:[{payments}]}}).verifiedGatewayFailure({...payment,method:'PAYPAL'})).unpaidFailure,expected);}});
test('empty targeted order list does not scan unrelated customers',async()=>{const f=fixture();const r=await f.syncFailedGatewayPayments({orderIds:[]});assert.equal(r.checked,0);assert.equal(f.rpc.length,0);});
test('scheduler rejects missing/wrong credentials and returns a private count-only response',async()=>{let calls=0;const route=load('app/api/cron/payment-status/route.ts',{'@/lib/checkout-payment-session':{expireUnpaidCheckouts:async()=>3},'next/server':{NextRequest,NextResponse},'@/lib/payment-failure-sync':{syncFailedGatewayPayments:async()=>{calls++;return{checked:2,failed:0,releasedOrderIds:['private-order']}}}},{process:{env:{CRON_SECRET:'s'.repeat(32)}}});
 for(const auth of ['', 'Bearer wrong'])assert.equal((await route.GET(new NextRequest('https://shop.test/api/cron/payment-status',{headers:{authorization:auth}}))).status,401);
 assert.equal(calls,0);const r=await route.GET(new NextRequest('https://shop.test/api/cron/payment-status',{headers:{authorization:'Bearer '+'s'.repeat(32)}}));assert.equal(r.status,200);assert.equal(r.headers.get('cache-control'),'no-store');assert.deepEqual(await r.json(),{expired:3,checked:2,released:1,failed:0});
});

function route(file, extra = {}, globals = {}) {
 const mocks={'next/server':{NextRequest,NextResponse}};
 for (const m of fs.readFileSync(file,'utf8').matchAll(/from ["'](@\/[^"']+)["']/g)) mocks[m[1]]={};
 return load(file,{...mocks,...extra},globals);
}
test('Pally failure callback requires a valid signature and rechecks the provider',async()=>{
 const {createHash}=require('node:crypto');let calls=0,failed=0;
 const r=route('app/api/pally/webhook/route.ts',{
  '@/lib/pally':{getPallyApiToken:()=> 'fixture-secret'},
  '@/lib/payment-failure-sync':{syncFailedGatewayPayments:async input=>{calls++;assert.equal(input.method,'PALLY');assert.equal(input.orderIds[0],payment.order_id);return{failed};}},
 });
 async function send(signature){const form=new FormData();for(const[k,v]of Object.entries({InvId:payment.order_id,OutSum:'100',Status:'FAIL',SignatureValue:signature}))form.set(k,v);return r.POST(new NextRequest('https://shop.test/api/pally/webhook',{method:'POST',body:form}));}
 assert.equal((await send('forged')).status,401);assert.equal(calls,0);
 const signature=createHash('md5').update('100:'+payment.order_id+':fixture-secret').digest('hex');
 assert.equal((await send(signature)).status,200);assert.equal(calls,1);
 failed=1;assert.equal((await send(signature)).status,503);
});
test('Binance closed notifications are authenticated before independent failure verification',async()=>{
 const {generateKeyPairSync,sign}=require('node:crypto');const keys=generateKeyPairSync('rsa',{modulusLength:2048});let calls=0;
 const r=route('app/api/binance-pay/webhook/route.ts',{
  '@/lib/binance-pay':{callBinancePay:async()=>[{certSerial:'fixture',certPublic:keys.publicKey.export({type:'spki',format:'pem'})}]},
  '@/lib/payment-failure-sync':{syncFailedGatewayPayments:async input=>{calls++;assert.equal(input.gatewayOrderId,'reference');return{failed:0};}},
 });
 const raw=JSON.stringify({bizType:'PAY',bizStatus:'PAY_CLOSED',data:{prepayId:'reference'}}),timestamp=String(Date.now()),nonce='fixture';
 const signature=sign('RSA-SHA256',Buffer.from(timestamp+'\n'+nonce+'\n'+raw+'\n'),keys.privateKey).toString('base64');
 const send=s=>r.POST(new NextRequest('https://shop.test/api/binance-pay/webhook',{method:'POST',body:raw,headers:{'BinancePay-Timestamp':timestamp,'BinancePay-Nonce':nonce,'BinancePay-Certificate-SN':'fixture','BinancePay-Signature':s}}));
 assert.equal((await send('invalid')).status,401);assert.equal(calls,0);
 assert.equal((await send(signature)).status,200);assert.equal(calls,1);
});
test('NOWPayments failure requires signed notification before storing a reference or polling',async()=>{
 const {createHmac}=require('node:crypto');let writes=0,calls=0;
 const q={eq(){return q},then(resolve){resolve({error:null})}};
 const r=route('app/api/nowpayments/webhook/route.ts',{
  '@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({update(){writes++;return q;}})})},
  '@/lib/payment-failure-sync':{syncFailedGatewayPayments:async()=>{calls++;return{failed:0};}},
 },{process:{env:{NOWPAYMENTS_IPN_SECRET:'fixture'}}});
 const raw=JSON.stringify({invoice_id:12,order_id:payment.order_id,payment_id:34,payment_status:'expired'});
 const send=s=>r.POST(new NextRequest('https://shop.test/api/nowpayments/webhook',{method:'POST',body:raw,headers:{'x-nowpayments-sig':s}}));
 assert.equal((await send('bad')).status,401);assert.equal(writes,0);assert.equal(calls,0);
 assert.equal((await send(createHmac('sha512','fixture').update(raw).digest('hex'))).status,200);assert.equal(calls,1);assert.equal(writes,1);
});
test('PayPal denial never releases limits without verified notification and server lookup',async()=>{
 let valid=false,calls=0;
 const r=route('app/api/paypal/webhook/route.ts',{
  '@/lib/request-security':{privateJson:(body,status=200)=>NextResponse.json(body,{status})},
  '@/lib/paypal-webhook':{readPayPalBody:r=>r.text(),verifyPayPalWebhook:async()=>valid?{event_type:'PAYMENT.CAPTURE.DENIED',resource:{supplementary_data:{related_ids:{order_id:'ABC123456789'}}}}:null},
  '@/lib/payment-failure-sync':{syncFailedGatewayPayments:async()=>{calls++;return{failed:0};}},
 });
 const send=()=>r.POST(new Request('https://shop.test/api/paypal/webhook',{method:'POST',body:'{}'}));
 assert.equal((await send()).status,401);assert.equal(calls,0);
 valid=true;assert.equal((await send()).status,200);assert.equal(calls,1);
});
test('browser failure returns use server checks and repeated canceled returns lead to checkout',async()=>{
 for(const provider of ['pally','freekassa']){
  let calls=0,canceled=false;
  const r=route('app/api/'+provider+'/fail/route.ts',{
   '@/lib/payment-failure-sync':{syncFailedGatewayPayments:async()=>{calls++;return{releasedOrderIds:[],failed:0};}},
   '@/lib/supabase/admin':{createAdminClient:()=>({from:table=>{const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:table==='orders'?{status:canceled?'CANCELLED':'PENDING_PAYMENT'}:null,error:null})};return q;}})},
  });
  const req=()=>new NextRequest('https://shop.test/api/'+provider+'/fail?o='+payment.order_id);
  assert.equal(new URL((await r.GET(req())).headers.get('location')).pathname,'/checkout/payment');
  canceled=true;assert.equal(new URL((await r.GET(req())).headers.get('location')).pathname,'/checkout');
  assert.equal(calls,2);
 }
});
