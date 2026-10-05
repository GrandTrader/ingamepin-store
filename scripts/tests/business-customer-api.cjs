const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
const {NextRequest,NextResponse}=require('next/server');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,{exports,require:n=>n==='server-only'?{}:n in mocks?mocks[n]:require(n),process,URL,Headers,Request,Response,Date,console});return exports;}
const inputs=load('lib/business-api-input.ts',{'@/lib/trusted-client-ip':load('lib/trusted-client-ip.ts')});
assert.deepEqual([...inputs.apiAllowedIps('203.0.113.10, 203.0.113.10\n2001:0db8::1')],['203.0.113.10','2001:db8::1']);
for(const bad of ['','0.0.0.0/0','127.0.0.1/8','example.com','1.2.3.4:80'])assert.throws(()=>inputs.apiAllowedIps(bad));
const env={VERCEL:process.env.VERCEL,NODE_ENV:process.env.NODE_ENV};
process.env.VERCEL='1';assert.equal(inputs.businessApiIp(new Headers({'x-forwarded-for':'203.0.113.10','cf-connecting-ip':'203.0.113.10'})),null,'Spoofable headers alone cannot authenticate');
assert.equal(inputs.businessApiIp(new Headers({'x-vercel-forwarded-for':'203.0.113.20','x-forwarded-for':'203.0.113.10'})),'203.0.113.20');
delete process.env.VERCEL;process.env.NODE_ENV='production';assert.equal(inputs.businessApiIp(new Headers()),null);
process.env.NODE_ENV='development';assert.equal(inputs.businessApiIp(new Headers({'x-forwarded-for':'203.0.113.10'})),'127.0.0.1');
for(const [k,v] of Object.entries(env))if(v===undefined)delete process.env[k];else process.env[k]=v;
const user={id:'owner-id',email:'owner@example.invalid',email_confirmed_at:'2026-01-01',app_metadata:{}};
let rpcResult={data:{userId:user.id,keyId:'key',canOrder:false},error:null},rpcCalls=0;
let securityReady=true;
const auth=load('lib/business-api-auth.ts',{'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async()=>{rpcCalls++;return rpcResult;},auth:{admin:{getUserById:async()=>({data:{user},error:null})}}})},'@/lib/business-security':{businessSecurity:async()=>({approved:true,password_ready:securityReady,totp_ready:securityReady})},'./business-api-input':{businessApiIp:()=> '203.0.113.10'}});
const headers={Authorization:'Bearer igp_b2b_'+'a'.repeat(43)};
(async()=>{
 assert.equal((await auth.authorizeBusinessApi(new Request('http://test'))).error.status,401);assert.equal(rpcCalls,0);
 assert.equal((await auth.authorizeBusinessApi(new Request('http://test',{headers}),true)).error.status,403);
 assert.equal((await auth.authorizeBusinessApi(new Request('http://test',{headers}))).principal.user.id,user.id);
 securityReady=false;assert.equal((await auth.authorizeBusinessApi(new Request('http://test',{headers}))).error.status,403);securityReady=true;
 rpcResult={data:null,error:null};assert.equal((await auth.authorizeBusinessApi(new Request('http://test',{headers}))).error.status,403);
 rpcResult={data:null,error:{message:'business_api_rate_limit'}};const limit=await auth.authorizeBusinessApi(new Request('http://test',{headers}));assert.equal(limit.error.status,429);assert.equal(limit.error.headers.get('Retry-After'),'60');
 rpcResult={data:null,error:{message:'database unavailable'}};assert.equal((await auth.authorizeBusinessApi(new Request('http://test',{headers}))).error.status,503);
 let requiredPermission,forwarded,filters=[],returnedOrder=null,readCodes=0;
 const builder={select(){return this;},eq(k,v){filters.push([k,v]);return this;},maybeSingle:async()=>({data:returnedOrder,error:null})};
 const route=load('app/api/v1/business/[...path]/route.ts',{
  '@/lib/business-api-auth':{businessApiJson:auth.businessApiJson,authorizeBusinessApi:async(req,ordering)=>{requiredPermission=ordering;return {error:null,principal:{user,ip:'203.0.113.10'}};}},
  '@/lib/business-api-input':inputs,'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>builder})},
  '@/lib/delivered-codes':{getAllDeliveredCodes:async()=>{readCodes++;return[];}},'@/lib/product-range-data':{},
  '@/lib/order-request-handler':{handleOrder:async(request,principal,ip)=>{forwarded={body:await request.json(),principal,ip,headers:request.headers};return NextResponse.json({result:{total:10}});}},
  '@/app/api/products/quantity-limits/route':{},
 });
 const context=path=>({params:Promise.resolve({path})});
 const id='123e4567-e89b-42d3-a456-426614174000';
 const request=(key,body)=>new NextRequest('http://test/api/v1/business/orders',{method:'POST',headers:{...headers,...(key?{'Idempotency-Key':key}:{}),'cf-connecting-ip':'bad','Content-Type':'application/json'},body:JSON.stringify(body)});
 assert.equal((await route.POST(request(null,{}),context(['orders']))).status,400);
 const body={items:[{productOptionId:id,quantity:2}],reference:'MY-ORDER',expectedTotal:10,customer:{email:'victim@example.invalid'},paymentMethod:'binance',action:'quote'};
 const response=await route.POST(request(id,body),context(['orders']));assert.equal(response.status,200);assert.equal(requiredPermission,true);assert.equal(forwarded.principal.id,user.id);assert.equal(forwarded.body.action,'confirm');assert.equal(forwarded.body.paymentMethod,'wallet');assert.equal(forwarded.body.customer,undefined);assert.equal(forwarded.body.requestId,id);assert.equal(forwarded.headers.get('cf-connecting-ip'),null);assert.equal(forwarded.ip,'203.0.113.10');assert.equal(forwarded.headers.get('authorization'),null);assert.equal(response.headers.get('Cache-Control'),'private, no-store');
 await route.POST(request(null,body),context(['orders','quote']));assert.equal(requiredPermission,false);assert.equal(forwarded.body.action,'quote');
 let result=await route.GET(new NextRequest('http://test/api/v1/business/orders/'+id+'/codes'),context(['orders',id,'codes']));assert.equal(result.status,404);assert(filters.some(([k,v])=>k==='customer_id'&&v===user.id));assert(filters.some(([k,v])=>k==='sales_channel'&&v==='BUSINESS'));assert.equal(readCodes,0);
 returnedOrder={id,status:'REFUNDED',order_items:[{id:'item'}]};result=await route.GET(new NextRequest('http://test/api/v1/business/orders/'+id+'/codes'),context(['orders',id,'codes']));assert.equal(result.status,409);assert.equal(readCodes,0);
 returnedOrder={id,status:'DELIVERED',order_items:[{id:'item',quantity:2}]};result=await route.GET(new NextRequest('http://test/api/v1/business/orders/'+id+'/codes'),context(['orders',id,'codes']));assert.equal(result.status,200);assert.equal(readCodes,1);
 let approvedIps=['203.0.113.10'],createdKey=null,changedKey=null;
 const keysDb={rpc:async(name,args)=>{createdKey=args;return {data:'key',error:null};},from(table){const q={select(){return this},eq(){return this},is(){return this},update(value){changedKey=value;return this},maybeSingle:async()=>({data:table==='business_api_ip_approvals'?{ips:approvedIps}:{id:'key'},error:null})};return q;}};
 const keyActions=load('app/account/portal/api-access/actions.ts',{'@/lib/business-api-input':inputs,'next/cache':{revalidatePath(){}},'@/lib/business-portal-data':{portalCustomer:async()=>({user})},'@/lib/supabase/admin':{createAdminClient:()=>keysDb}});
 const form=new FormData();form.set('name','Server key');form.set('days','90');form.set('ip','203.0.113.99');form.set('ips','203.0.113.99');assert((await keyActions.createBusinessKey({},form)).error);assert.equal(createdKey,null);
 form.set('ip','203.0.113.10');assert((await keyActions.createBusinessKey({},form)).secret);assert.equal(createdKey.p_ips.length,1);assert.equal(createdKey.p_ips[0],'203.0.113.10');assert.equal(createdKey.p_user,user.id);
 approvedIps=[];assert((await keyActions.createBusinessKey({},form)).error);form.set('id',id);form.set('operation','update');await keyActions.updateBusinessKey({},form);assert.equal(changedKey.allowed_ips,undefined,'Forged IP changes are ignored');
 console.log('PASS: IP normalization, trusted IP detection, missing/revoked keys, read-only permission, rate limiting, account-bound code access, refunded-code denial, server-owned identity and wallet-only idempotent order forwarding.');
})().catch(e=>{console.error(e);process.exitCode=1;});
