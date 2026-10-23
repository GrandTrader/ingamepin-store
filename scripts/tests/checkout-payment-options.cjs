const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>n==='server-only'?{}:n in mocks?mocks[n]:require(n),console,Date,process:{env:{}},...globals});return exports;}
const commission=load('lib/payment-gateway-commissions.ts'),expiry=load('lib/checkout-expiry.ts');
function fixture(opts={}){
 const all=['WALLET','UPI','PAYPAL','BINANCE_PAY','USDT_DIRECT','PALLY','FREEKASSA'];
 const records={order_items:[{product_id:'product'}],payment_gateway_settings:{gateway_commissions:{PALLY:{enabled:true,type:'PERCENTAGE',value:4},PAYPAL:{enabled:true,type:'PERCENTAGE',value:5},UPI:{enabled:!opts.upiOff,type:'FIXED',value:0.5}}},
 products:[{id:'product',allowed_payment_methods:opts.allowed??all,allowed_usdt_networks:opts.networks}],checkout_payment_attempts:opts.attempts??[]};
 const db={from:table=>{const q={select(){return q},eq(){return q},in(){return q},single(){return Promise.resolve({data:records[table],error:opts.failure?{}:null})},then(ok){return q.single().then(ok)}};return q}};
 const env=opts.noKeys?{}:Object.fromEntries(['PALLY_SHOP_ID','PALLY_API_TOKEN','BINANCE_PAY_API_KEY','BINANCE_PAY_SECRET_KEY','USDT_GATEWAY_URL','USDT_GATEWAY_API_SECRET','USDT_GATEWAY_CALLBACK_SECRET','FREEKASSA_MERCHANT_ID','FREEKASSA_SECRET_WORD_1','FREEKASSA_SECRET_WORD_2'].map(k=>[k,'fixture']));
 const mod=load('lib/checkout-payment-options.ts',{'@/lib/supabase/admin':{},'@/lib/payment-gateway-commissions':commission,'@/lib/checkout-expiry':expiry,
 '@/lib/paypalych-product-policy-server':{getPaypalychRestrictions:async()=>new Map([['product',opts.blocked??null]])},'@/lib/paypal-checkout':{paypalCheckoutAvailable:async()=>!opts.paypalOff}}, {process:{env}});
 return()=>mod.retryPaymentOptions(db,{id:'order',total:10.4,payment_fee:0.4,currency:'USD'},{method:'PALLY',status:opts.submitted?'SUBMITTED':'PENDING',checkout_revision:3},!opts.guest);
}
test('choices replace the previous fee and keep the current saved quote',async()=>{
 const result=await fixture()();assert.equal(result.revision,3);assert.equal(result.selected,'pally');
 const by=Object.fromEntries(result.choices.map(c=>[c.value,c]));assert.equal(by.pally.total,10.4);assert.equal(by.wallet.total,10);
 assert.equal(by.paypal.total,10.5);assert.equal(by.manual_upi.total,10.5);assert.equal(by.upi.total,10.5);
});
test('choices respect product restrictions, configuration, wallet ownership and prior gateway attempts',async()=>{
 for(const [opts,absent]of [[{guest:true},['wallet']],[{upiOff:true},['upi','manual_upi']],[{paypalOff:true},['paypal']],
 [{blocked:'restricted'},['pally']],[{allowed:['WALLET']},['pally','upi','paypal','freekassa','binance','usdt']],
 [{networks:[]},['usdt']],[{noKeys:true},['pally','binance','usdt','freekassa']],
 [{attempts:[{method:'PAYPAL',gateway_order_id:'previous'}]},['paypal']]]){
 const result=await fixture(opts)();for(const value of absent)assert(!result.choices.some(c=>c.value===value),JSON.stringify(opts)+' '+value);
 }
 for(const opts of [{failure:true},{submitted:true},{attempts:[{method:'PAYPAL',received_at:'today'}]}])await assert.rejects(fixture(opts)());
});
test('retry selector sends the chosen method, confirmed quote and version without creating a new order',async()=>{
 let slots=[Date.now(),false,'',null,''],cursor=0,requests=[];const store=new Map();
 const mod=load('components/OrderPaymentActions.tsx',{
 'react':{useState:()=>{const i=cursor++;return[slots[i],v=>{slots[i]=v}]},useEffect:()=>{}},'next/link':{default:'a'},'@/lib/checkout-expiry':expiry,
 },{window:{location:{assign:url=>store.set('redirect',url)}},localStorage:{setItem:(k,v)=>store.set(k,v)},fetch:async(url,init)=>{
 const body=JSON.parse(init.body);requests.push({url,body});
 return{ok:true,json:async()=>body.action==='options'?{choices:[{value:'pally',method:'PALLY',label:'SBP',total:10.4,fee:.4},{value:'paypal',method:'PAYPAL',label:'PayPal',total:10.5,fee:.5}],revision:3,selected:'pally'}:
 {pendingOrder:{id:'SAME-ORDER',paymentMethod:body.paymentMethod,totalAmount:body.expectedTotal},nextUrl:'/checkout/payment'}};
 }});
 const render=()=>{cursor=0;return mod.default({orderNumber:'SAME-ORDER',status:'PENDING_PAYMENT',paymentStatus:'PENDING',paymentMethod:'PALLY',createdAt:new Date().toISOString(),total:10.4,currency:'USD'})};
 function find(node,predicate){if(!node||typeof node!=='object')return null;if(predicate(node))return node;for(const child of [node.props?.children].flat(Infinity)){const found=find(child,predicate);if(found)return found;}return null;}
 const button=find(render(),n=>n.type==='button');button.props.onClick();await new Promise(resolve=>setImmediate(resolve));
 find(render(),n=>n.type==='select').props.onChange({target:{value:'paypal'}});
 const confirm=find(render(),n=>n.type==='button'&&n.props.children==='Continue to PayPal');assert(confirm);confirm.props.onClick();await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requests.length,2);assert.equal(requests[1].body.orderNumber,'SAME-ORDER');assert.equal(requests[1].body.paymentMethod,'paypal');assert.equal(requests[1].body.expectedTotal,10.5);assert.equal(requests[1].body.revision,3);
 assert.equal(store.get('redirect'),'/checkout/payment');assert.equal(JSON.parse(store.get('pendingOrder')).paymentMethod,'paypal');
});
