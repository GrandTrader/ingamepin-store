const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,console,require:name=>{if(name in mocks)return mocks[name];if(name.startsWith('node:'))return require(name);throw Error('Unexpected dependency '+name);}});return exports;}
const parser=load('lib/portal-checkout.ts');
const base={action:'confirm',paymentMethod:'wallet',requestId:'00000000-0000-4000-8000-000000000010',expectedTotal:12,items:[{productOptionId:'00000000-0000-4000-8000-000000000001',quantity:2,customValue:100,unitPrice:0.01}],reference:' MY-REF ',customer:{email:'forged@example.com'},userId:'forged-user'};
for(const method of ['pally','freekassa','usdt','binance','WALLET'])assert.throws(()=>parser.portalCheckoutInput({...base,paymentMethod:method}),/only be paid/);
for(const quantity of [0,-1,1.1,Infinity])assert.throws(()=>parser.portalCheckoutInput({...base,items:[{...base.items[0],quantity}]}),/Invalid order line/);
assert.throws(()=>parser.portalCheckoutInput({...base,expectedTotal:NaN}),/Review/);
const normalized=parser.portalCheckoutInput(base);assert.equal(normalized.reference,'MY-REF');assert.equal(normalized.items[0].unitPrice,undefined);assert.equal(normalized.customer,undefined);
let user=null,approval='PENDING',rpcResult={data:null,error:null},calls=[];
const chain={select(){return this;},eq(){return this;},async maybeSingle(){return {data:{status:approval},error:null};}};
const admin={from(table){assert.equal(table,'business_kyb');return chain;},async rpc(name,args){calls.push({name,args});return rpcResult;}};
const mocks={'@/lib/portal-checkout':parser,'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user}})}})},'@/lib/supabase/admin':{createAdminClient:()=>admin},'next/server':{NextResponse:{json:(body,options={})=>({status:options.status??200,body})}}};
for(const match of fs.readFileSync('app/api/orders/route.ts','utf8').matchAll(/from ["'](@\/[^"']+)["']/g))mocks[match[1]]??={};
const {POST}=load('app/api/orders/route.ts',mocks);
const request=body=>({json:async()=>structuredClone(body),nextUrl:{pathname:'/api/account/portal/orders'},headers:new Headers()});
(async()=>{
 assert.equal((await POST(request({...base,paymentMethod:'pally'}))).status,400);assert.equal(calls.length,0);
 assert.equal((await POST(request(base))).status,401);assert.equal(calls.length,0);
 user={id:'real-user',email:'real@example.com',app_metadata:{},user_metadata:{}};
 assert.equal((await POST(request(base))).status,401);
 user.email_confirmed_at=new Date().toISOString();user.app_metadata.wallet_disabled=true;
 assert.equal((await POST(request(base))).status,403);assert.equal(calls.length,0);
 user.app_metadata={};assert.equal((await POST(request(base))).status,403);assert.equal(calls[0].args.p_user,'real-user');assert.equal(calls[0].args.p_items[0].unitPrice,undefined);
 rpcResult={data:{orderId:'existing-order',orderNumber:'IPB2B20260928123456',replayed:true},error:null};
 const replay=await POST(request(base));assert.equal(replay.status,200);assert.equal(replay.body.result.orderId,'existing-order');assert(calls.every(c=>c.name==='portal_wallet_checkout'&&c.args.p_action==='recover'));
 rpcResult={data:null,error:{message:'Connection lost',code:''}};assert.equal((await POST(request(base))).status,503,'Uncertain recovery must preserve the confirmation key');
 rpcResult={data:null,error:{message:'Function missing',code:'PGRST202'}};assert.equal((await POST(request(base))).status,400);
 console.log('PASS: wallet-only API, signed-in verified identity, KYB gate, discarded client prices/identity, replay before stock checks, uncertain recovery retains retry key.');
})().catch(e=>{console.error(e);process.exitCode=1;});
