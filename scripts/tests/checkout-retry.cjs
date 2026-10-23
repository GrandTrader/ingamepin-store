const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {NextRequest,NextResponse}=require('next/server');
const {createHash}=require('node:crypto');
const id='00000000-0000-4000-8000-000000000001',buyer='00000000-0000-4000-8000-000000000010',secret='x'.repeat(43);
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='server-only'?{}:n in mocks?mocks[n]:require(n),console:{error(){}},Buffer,URL,Date,process:{env:{}}});return exports;}
const expiry=load('lib/checkout-expiry.ts');
const access=load('lib/purchase-access.ts',{'next/headers':{},'@/lib/supabase/server':{},'@/lib/supabase/admin':{}});
function query(data,opts={}){const q={eq(){return q},or(){return q},not(){return q},select(){return q},update(p){opts.writes?.push(p);return q},single(){return Promise.resolve({data,error:opts.error??null})},maybeSingle(){return q.single()}};return q;}
function retryFixture(opts={}){
 const order={id,order_number:'IP2026TEST',customer_id:opts.other? 'other':buyer,customer_email:opts.other?'other@example.com':'buyer@example.com',customer_name:'Buyer',total:10,currency:'USD',status:'PENDING_PAYMENT',sales_channel:opts.business?'BUSINESS':'RETAIL',paid_at:opts.paid?'today':null};
 const user={id:buyer,email:'buyer@example.com',email_confirmed_at:'today',app_metadata:{wallet_disabled:opts.disabled}};
 const identity=opts.anonymous?null:{email:user.email,userId:opts.guest?null:buyer,source:opts.guest?'guest':'account'};
 const state={calls:[],debits:0,writes:[],notifications:0,checked:0};
 const db={from:table=>query(table==='orders'?order:{method:opts.method??'PALLY'},state),async rpc(name,args){
 state.calls.push({name,args});
 if(name==='pay_order_with_wallet'){state.debits++;return{data:{balanceAfter:90}}}
 if(name==='switch_checkout_payment_method')return {data:{id,orderNumber:order.order_number,totalAmount:args.p_expected_total,currency:'USD',paymentMethod:args.p_method,checkoutVariant:args.p_variant,createdAt:'2026-10-23T10:00:00Z',expiresAt:'2026-10-23T10:15:00Z'}};
 assert.equal(name,'prepare_order_payment_retry');assert.equal(args.p_order_id,id);assert.match(args.p_access_hash,/^[a-f0-9]{64}$/);
 return opts.rpcError?{error:{code:'P0001',message:'Payment already submitted'}}:{data:{id,orderNumber:order.order_number,totalAmount:10,currency:'USD',paymentMethod:opts.method??'PALLY',createdAt:'2026-10-23T10:00:00Z',expiresAt:'2026-10-23T10:15:00Z'}};
 }};
 const route=load('app/api/orders/retry-payment/route.ts',{
 'next/server':{NextRequest,NextResponse},'@/lib/supabase/admin':{createAdminClient:()=>db},
 '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user}})}})},
 '@/lib/business-security':{businessSessionReady:async()=>!opts.businessDenied},
 '@/lib/purchase-access':{...access,purchaseIdentity:async()=>identity},
 '@/lib/request-security':{sameOrigin:()=>!opts.cross,privateJson:(body,status=200)=>NextResponse.json(body,{status,headers:{'cache-control':'private, no-store'}}),requestLimit:async()=>opts.limited?NextResponse.json({error:'limited'},{status:429}):null},
 '@/lib/checkout-payment-session':{assertCheckoutOpen:async()=>{state.checked++;if(opts.expired)throw Error('Payment window expired');}},
 '@/lib/checkout-expiry':expiry,
 '@/lib/checkout-payment-options':{retryPaymentOptions:async(_db,_order,_payment,walletAllowed)=>({revision:0,selected:'pally',choices:[
 {value:'pally',method:'PALLY',label:'SBP',total:10,fee:0},
 {value:'paypal',method:'PAYPAL',label:'PayPal',total:10.5,fee:0.5},
 ...(walletAllowed?[{value:'wallet',method:'WALLET',label:'Wallet',total:10,fee:0}]:[])]})},
 '@/lib/manual-fulfillment':{prepareOrderForManualFulfillment:async()=>{if(opts.notifyError)throw Error('unavailable');return{status:'PAID'}}},
 '@/lib/email':{sendWalletDebitEmails:async()=>{state.notifications++},sendOrderStatusEmails:async()=>{}},
 '@/lib/telegram-order-notification':{notifyPaidOrderInTelegram:async()=>{}},
 });
 return {state,send:body=>route.POST(new NextRequest('https://shop.test/api/orders/retry-payment',{method:'POST',body:JSON.stringify({orderNumber:'IP2026TEST',...body})}))};
}
test('retry authorizes the actual owner and never trusts posted email or order totals',async()=>{
 for(const [opts,status]of [[{anonymous:true},401],[{other:true},404],[{cross:true},403],[{limited:true},429]]){
 const f=retryFixture(opts),r=await f.send({email:'other@example.com',totalAmount:1});assert.equal(r.status,status);assert.equal(f.state.calls.length,0);assert.equal(f.state.writes.length,0);}
 const f=retryFixture(),r=await f.send({totalAmount:1}),data=await r.json();
 assert.equal(r.status,200);assert.equal(data.pendingOrder.totalAmount,10);assert.equal(data.pendingOrder.databaseId,id);
 assert.equal(data.pendingOrder.paymentMethod,'pally');assert.equal(data.pendingOrder.expiresAt,'2026-10-23T10:15:00Z');
 assert.equal(data.nextUrl,'/checkout/payment');assert.equal(f.state.debits,0);
 assert.equal(createHash('sha256').update(data.pendingOrder.accessToken).digest('hex'),f.state.calls[0].args.p_access_hash);
 assert.equal(r.headers.get('cache-control'),'private, no-store');
});
test('guest email verification permits reopening external payment, not spending a wallet',async()=>{
 assert.equal((await retryFixture({guest:true}).send()).status,200);
 const f=retryFixture({guest:true,method:'WALLET'});assert.equal((await f.send({action:'pay-wallet'})).status,403);assert.equal(f.state.debits,0);
});
test('business retry requires the verified B2B session',async()=>{const f=retryFixture({business:true,businessDenied:true});assert.equal((await f.send()).status,403);assert.equal(f.state.calls.length,0);});
test('expired or submitted orders cannot get a new payment token',async()=>{
 for(const opts of [{expired:true},{rpcError:true}]){const f=retryFixture(opts);assert.equal((await f.send()).status,409);assert.equal(f.state.debits,0);if(opts.expired)assert.equal(f.state.calls.length,0);}
});
test('wallet requires explicit payment action, respects disabled access, and returns paid receipt once committed',async()=>{
 for(const [opts,body,status]of [[{},undefined,409],[{disabled:true},{action:'pay-wallet'},403]]){
 const f=retryFixture({method:'WALLET',...opts});assert.equal((await f.send(body)).status,status);assert.equal(f.state.debits,0);}
 for(const notifyError of [false,true]){const f=retryFixture({method:'WALLET',notifyError}),r=await f.send({action:'pay-wallet'});assert.equal(r.status,200);assert.equal((await r.json()).paid,true);assert.equal(f.state.debits,1);}
 const f=retryFixture({paid:true,method:'WALLET'});assert.equal((await f.send({action:'pay-wallet'})).status,200);assert.equal(f.state.debits,0);
});
function sessionFixture(opts={}){
 const state={calls:[],writes:[],created:0};
 const payment={id:'payment',method:opts.method??'PALLY',status:opts.submitted?'SUBMITTED':'PENDING',gateway_order_id:opts.link?'reference':null,gateway_checkout_url:opts.link};
 const db={from:table=>query(table==='orders'?{access_token_hash:createHash('sha256').update(secret).digest('hex')}:payment,{writes:state.writes,error:opts.writeError&&table==='payments'?{message:'failed'}:null}),
 async rpc(name){state.calls.push(name);if(name==='assert_checkout_open'&&opts.expired)return{error:{code:'P0001',message:'expired'}};
 if(name==='begin_checkout_session')return opts.concurrent?{error:{code:'P0001',message:'session being prepared'}}:{data:{checkout_creation_token:'token'}};
 return{data:true};}};
 const mod=load('lib/checkout-payment-session.ts',{'next/server':{NextRequest,NextResponse},'@/lib/supabase/admin':{createAdminClient:()=>db}});
 return{state,send:async({token=secret,method='PALLY',invalid=false}={})=>mod.runCheckoutSession(new NextRequest('https://shop.test/api/payment',{method:'POST',body:JSON.stringify({orderId:id,accessToken:token})}),method,async(_,claim,existingUrl)=>{
 if(existingUrl)return NextResponse.json({checkoutUrl:existingUrl});
 if(invalid)return NextResponse.json({error:'invalid network'},{status:400});
 await claim();state.created++;return NextResponse.json({checkoutUrl:'https://gateway.test/new'});
 })};
}
test('gateway reopening returns saved link without another invoice or exchange-rate change',async()=>{
 const f=sessionFixture({link:'https://gateway.test/original'}),r=await f.send();assert.equal(r.status,200);assert.equal((await r.json()).checkoutUrl,'https://gateway.test/original');
 assert.equal(f.state.created,0);assert(!f.state.calls.includes('begin_checkout_session'));assert.equal(f.state.writes.length,0);
});
test('gateway sessions reject expired, submitted, wrong-method and invalid-token access',async()=>{
 for(const [opts,input,status]of [[{expired:true},{},409],[{submitted:true},{},409],[{method:'PAYPAL'},{},409],[{},{token:'wrong'.repeat(10)},403]]){
 const f=sessionFixture(opts);assert.equal((await f.send(input)).status,status);assert.equal(f.state.created,0);assert.equal(f.state.writes.length,0);}
});
test('validation runs before claim, while simultaneous creation is denied',async()=>{
 const invalid=sessionFixture();assert.equal((await invalid.send({invalid:true})).status,400);assert(!invalid.state.calls.includes('begin_checkout_session'));
 const concurrent=sessionFixture({concurrent:true});assert.equal((await concurrent.send()).status,409);assert.equal(concurrent.state.created,0);
 const valid=sessionFixture();assert.equal((await valid.send()).status,200);assert.equal(valid.state.created,1);assert.equal(valid.state.writes[0].checkout_creation_token,null);
});
test('deadline uses original creation, never local retry time',()=>{
 assert.equal(expiry.checkoutDeadline('2026-10-23T10:00:00Z'),Date.parse('2026-10-23T10:15:00Z'));
 assert.equal(expiry.checkoutDeadline('2026-10-23T10:00:00Z','2026-10-23T10:12:00Z'),Date.parse('2026-10-23T10:12:00Z'));
 assert.equal(expiry.checkoutDeadline('invalid'),0);
});

test('payment options require ownership, and method changes require the displayed quote and explicit wallet consent',async()=>{
 const f=retryFixture();const options=await (await f.send({action:'options'})).json();assert.equal(options.choices.length,3);assert.equal(f.state.calls.length,0);
 for(const body of [{paymentMethod:'unknown',revision:0,expectedTotal:10},{paymentMethod:'paypal',revision:1,expectedTotal:10.5},{paymentMethod:'paypal',revision:0,expectedTotal:1}]){
   assert.equal((await f.send(body)).status,409);assert.equal(f.state.calls.length,0);
 }
 assert.equal((await f.send({paymentMethod:'wallet',revision:0,expectedTotal:10})).status,409);assert.equal(f.state.debits,0);
 const changed=await f.send({paymentMethod:'paypal',revision:0,expectedTotal:10.5});assert.equal(changed.status,200);
 const result=await changed.json();assert.equal(result.pendingOrder.paymentMethod,'paypal');assert.equal(result.pendingOrder.totalAmount,10.5);
 assert.equal(result.pendingOrder.id,'IP2026TEST');assert.equal(result.pendingOrder.expiresAt,'2026-10-23T10:15:00Z');
 assert.equal(f.state.calls[0].name,'switch_checkout_payment_method');assert.equal(f.state.calls[0].args.p_method,'PAYPAL');
 const guest=retryFixture({guest:true});assert.equal((await guest.send({paymentMethod:'wallet',action:'pay-wallet',revision:0,expectedTotal:10})).status,409);assert.equal(guest.state.debits,0);
 const wallet=retryFixture();assert.equal((await wallet.send({paymentMethod:'wallet',action:'pay-wallet',revision:0,expectedTotal:10})).status,200);assert.equal(wallet.state.debits,1);
});
