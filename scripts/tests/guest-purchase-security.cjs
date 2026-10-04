const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const {NextRequest, NextResponse} = require('next/server');
const crypto = require('node:crypto');
function load(file, mocks = {}, env = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports, require:n=>n==='server-only'?{}:n in mocks?mocks[n]:require(n),process:{env:{NODE_ENV:'production',VERCEL:'1',GUEST_PURCHASE_SECRET:'isolated-test-secret',...env}},URL,Headers,Buffer,console:{error(){}},Date}, {filename:file});
  return exports;
}
function query(result, calls = []) {
  const q = {};
  for(const name of ['select','eq','gt','lt','gte','in','or','order','limit','range','insert','upsert','delete','update']) q[name] = (...args)=>{calls.push([name,...args]);return q;};
  q.then=(resolve,reject)=>Promise.resolve(typeof result==='function'?result():result).then(resolve,reject);
  q.maybeSingle=q.single=()=>Promise.resolve(typeof result==='function'?result():result);
  return q;
}
const json=(body,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'private, no-store'}});
const guard={privateJson:json,requestLimit:async()=>null,sameOrigin:()=>true,consumeRate:async()=>true,securityHash:s=>crypto.createHmac('sha256','fixture').update(s).digest('hex')};
const req=(body,cookie='',path='/api/orders/verification')=>new NextRequest('https://shop.test'+path,{method:'POST',headers:{origin:'https://shop.test','Content-Type':'application/json',cookie,'x-vercel-forwarded-for':'203.0.113.1'},body:JSON.stringify(body)});
function accessFixture(user=null, guest=null, token='a'.repeat(43), error=null) {
  const calls=[];
  const mod=load('lib/purchase-access.ts',{'next/headers':{cookies:async()=>({get:()=>({value:token})})},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user},error:null})}})},'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>query({data:guest,error},calls)})}});
  return {...mod,calls};
}
test('verified accounts need no OTP, guest tokens are hashed and expiry checked, unverified accounts cannot inherit another email',async()=>{
  const account=accessFixture({id:'user',email:' OWNER@Example.com ',email_confirmed_at:'2026-01-01'});
  assert.equal((await account.purchaseIdentity()).source,'account'); assert.equal(account.calls.length,0);
  assert.equal(await accessFixture(null,null,'bad').purchaseIdentity(),null);
  const guest=accessFixture(null,{email:'guest@example.com'});assert.equal((await guest.purchaseIdentity()).source,'guest');
  assert(guest.calls.some(c=>c[0]==='eq'&&c[1]==='token_hash'&&c[2]===guest.tokenHash('a'.repeat(43))));
  assert(guest.calls.some(c=>c[0]==='gt'&&c[1]==='expires_at'));
  assert.equal(await accessFixture({id:'u',email:'other@example.com'},{email:'guest@example.com'}).purchaseIdentity(),null);
  assert.equal((await accessFixture({id:'u',email:'guest@example.com'},{email:'guest@example.com'}).purchaseIdentity()).userId,null);
  await assert.rejects(accessFixture(null,null,undefined,{message:'offline'}).purchaseIdentity());
  assert.equal(account.ownsPurchase({email:'owner@example.com',userId:null},{customer_email:'other@example.com'}),false);
  assert.equal(account.ownsPurchase({email:'new@example.com',userId:'u'},{customer_id:'u',customer_email:'old@example.com'}),true);
});
function verificationFixture(options={}) {
  const records=[],mail=[],access=accessFixture();
  const db={from:table=>{assert(['guest_purchase_challenges','guest_purchase_sessions'].includes(table),'No order/account enumeration');const calls=[];records.push({table,calls});return query({error:null},calls);},rpc:async(name,args)=>{records.push({name,args});return {data:options.verifiedEmail??null,error:options.rpcError??null};}};
  return {records,mail,access,...load('app/api/orders/verification/route.ts',{
    '@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/purchase-access':access,'@/lib/request-security':{...guard,...options.guard},
    '@/lib/email':{sendEmail:async message=>{if(options.mailError)throw Error('SMTP unavailable');mail.push(message);}}
  })};
}
test('OTP send uses private hardened cookies, hashes secrets and treats unknown emails identically',async()=>{
  for(const email of ['known@example.com','unknown@example.com']){
    const f=verificationFixture(),response=await f.POST(req({action:'send',email}));assert.equal(response.status,200);
    assert.equal(f.mail.length,1);const code=f.mail[0].text.match(/\b\d{6}\b/)[0];
    const cookie=response.cookies.get('igp_purchase_challenge');assert.match(cookie.value,/^[\w-]{43}$/);assert.equal(cookie.httpOnly,true);assert.equal(cookie.secure,true);assert.equal(cookie.sameSite,'strict');assert.equal(cookie.maxAge,600);
    const saved=f.records.flatMap(r=>r.calls??[]).find(c=>c[0]==='insert')[1];
    assert.equal(saved.token_hash,f.access.tokenHash(cookie.value));assert.equal(saved.code_hash,guard.securityHash(`purchase-otp:${cookie.value}:${code}`));
    assert(!JSON.stringify(saved).includes(code));assert.match(response.headers.get('Cache-Control'),/no-store/);
  }
});
test('OTP errors fail closed, and successful verification rotates session authority',async()=>{
  for(const [options,body,status] of [[{guard:{sameOrigin:()=>false}},{action:'send',email:'a@b.com'},403],[{guard:{requestLimit:async()=>json({},429)}},{action:'send'},429],[{guard:{consumeRate:async()=>false}},{action:'send',email:'a@b.com'},429],[{mailError:true},{action:'send',email:'a@b.com'},503],[{},null,400],[{}, {action:'verify',code:'bad'},400]]){
    const f=verificationFixture(options),r=await f.POST(req(body));assert.equal(r.status,status);assert.equal(r.cookies.get('igp_purchase_session'),undefined);assert.equal(f.mail.length,0);
  }
  const cookie='igp_purchase_challenge='+'a'.repeat(43)+'; igp_purchase_session='+'b'.repeat(43);
  for(const email of [null,'owner@example.com']) {
    const f=verificationFixture({verifiedEmail:email}),r=await f.POST(req({action:'verify',code:'123456'},cookie));assert.equal(r.status,email?200:400);
    if(email){const session=r.cookies.get('igp_purchase_session');assert.equal(session.maxAge,3600);assert.notEqual(session.value,'b'.repeat(43));assert.equal(r.cookies.get('igp_purchase_challenge').maxAge,0);assert(f.records.some(x=>x.table==='guest_purchase_sessions'&&x.calls.some(c=>c[0]==='delete')));}
    else assert.equal(r.cookies.get('igp_purchase_session'),undefined);
  }
  const f=verificationFixture(),r=await f.DELETE(req({},cookie));assert.equal(r.cookies.get('igp_purchase_session').maxAge,0);
  assert(f.records.some(x=>x.table==='guest_purchase_sessions'&&x.calls.some(c=>c[0]==='eq'&&c[2]===f.access.tokenHash('b'.repeat(43)))));
});
test('purchase list enforces email/account scope and pagination independently of query parameters',async()=>{
  for(const identity of [null,{email:'owner@example.com',userId:null,source:'guest'},{email:'owner@example.com',userId:'11111111-1111-4111-8111-111111111111',source:'account'}]){
    const calls=[];const m=load('app/api/orders/lookup/route.ts',{'@/lib/purchase-access':{purchaseIdentity:async()=>identity},'@/lib/request-security':guard,'@/lib/delivery-receipts':{},'@/lib/delivered-codes':{},'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>query({data:Array.from({length:21},(_,i)=>({order_number:String(i)})),error:null},calls)})}});
    const r=await m.GET(new NextRequest('https://shop.test/api/orders/lookup?page=2&email=victim@example.com'));assert.equal(r.status,identity?200:401);
    if(!identity){assert.equal(calls.length,0);continue;}
    const body=await r.json();assert.equal(body.orders.length,20);assert.equal(body.hasMore,true);assert(!JSON.stringify(calls).includes('victim'));
    assert(calls.some(c=>identity.userId?c[0]==='or'&&c[1].includes(identity.userId):c[0]==='eq'&&c[1]==='customer_email'&&c[2]===identity.email));
    assert(calls.some(c=>c[0]==='range'&&c[1]===20&&c[2]===40));assert.equal((await m.GET(new NextRequest('https://shop.test/api/orders/lookup?page=-1'))).status,400);
  }
});
test('review rejects email impersonation but retains verified-account and secret-receipt access',async()=>{
  const access=accessFixture(),secret='r'.repeat(64);let identity=null,writes=0;
  const m=load('app/api/orders/review/route.ts',{'@/lib/purchase-access':{ownsPurchase:access.ownsPurchase,purchaseIdentity:async()=>identity},'@/lib/request-security':guard,'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>query({data:{id:'o',status:'DELIVERED',customer_email:'owner@example.com',customer_id:'u',access_token_hash:access.tokenHash(secret)}}),rpc:async()=>{writes++;return {data:{},error:null};}})}});
  const body={orderNumber:'IGP12345678',email:'owner@example.com',sentiment:'POSITIVE',comment:'Good'};
  assert.equal((await m.POST(req(body))).status,403);assert.equal(writes,0);
  identity={email:'other@example.com',userId:'x'};assert.equal((await m.POST(req(body))).status,403);
  identity={email:'owner@example.com',userId:null};assert.equal((await m.POST(req(body))).status,200);
  identity=null;assert.equal((await m.POST(req({...body,accessToken:secret}))).status,200);assert.equal(writes,2);
});
test('marketing consent cannot be forged for guests, unconfirmed users or another email',async()=>{
  let writes=0;const db={from:()=>({upsert:async()=>{writes++;return {error:null};}}),auth:{admin:{updateUserById:async()=>({})}}};
  const m=load('lib/checkout-consent.ts',{'@/lib/supabase/admin':{createAdminClient:()=>db}});
  const u={id:'u',email:'owner@example.com',email_confirmed_at:'2026-01-01'};
  for(const [user,email,consent] of [[null,u.email,true],[{...u,email_confirmed_at:null},u.email,true],[u,'victim@example.com',true],[u,u.email,false],[u,u.email,'true']])await m.saveCheckoutConsent(user,email,consent);
  assert.equal(writes,0);await m.saveCheckoutConsent(u,u.email,true);assert.equal(writes,1);
});
test('trusted IP, cross-site checks and distributed rate failures cannot be bypassed',async()=>{
  const trusted=load('lib/trusted-client-ip.ts');
  assert.equal(trusted.trustedClientIp(new Headers({'cf-connecting-ip':'1.1.1.1','x-forwarded-for':'1.1.1.1'})),null);
  assert.equal(trusted.trustedClientIp(new Headers({'x-vercel-forwarded-for':'bad'})),null);
  let result={data:true,error:null};const m=load('lib/request-security.ts',{'@/lib/trusted-client-ip':trusted,'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async()=>result})}});
  assert.equal(m.sameOrigin(new Request('https://shop.test',{headers:{origin:'https://evil.test'}})),false);
  assert.equal(m.sameOrigin(new Request('https://shop.test',{headers:{'sec-fetch-site':'cross-site'}})),false);
  assert.equal(await m.requestLimit(req({}),'test',10,60),null);
  result={data:false,error:null};assert.equal((await m.requestLimit(req({}),'test',10,60)).status,429);
  for(const r of [{data:null,error:null},{data:true,error:{message:'offline'}}]){result=r;await assert.rejects(m.requestLimit(req({}),'test',10,60));}
});
test('support limits apply before cookie/conversation creation; history returns newest messages chronologically',async()=>{
  let identities=0,reads=[],countError=false,blocked=true;
  const db={from:table=>query(()=>table==='support_conversations'?{data:{id:'conversation',status:'OPEN'}}:countError?{error:{message:'offline'}}:{data:[{id:'new',created_at:'2026-10-04T12:00:00Z'},{id:'old',created_at:'2026-10-04T11:00:00Z'}]},reads)};
  const m=load('app/api/support/chat/route.ts',{'next/headers':{cookies:async()=>{identities++;return {get:()=>undefined};}},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:null}})}})},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/request-security':{...guard,requestLimit:async()=>blocked?json({},429):null},'@/lib/support-chat':{cleanSupportText:v=>v??'',createSupportToken:()=>crypto.randomBytes(32).toString('hex'),hashSupportToken:s=>s,SUPPORT_COOKIE:'support'},'@/lib/telegram-chat-notification':{notifyNewSupportMessage:async()=>{throw Error('Unexpected message');}}});
  for(let i=0;i<3;i++)assert.equal((await m.POST(req({message:'hello'}))).status,429);assert.equal(identities,0);assert.equal(reads.length,0);
  const r=await m.GET(),body=await r.json();assert.equal(body.messages[0].id,'old');assert.equal(body.messages[1].id,'new');
  assert(reads.some(c=>c[0]==='order'&&c[1]==='created_at'&&c[2].ascending===false));assert(reads.some(c=>c[0]==='update'&&c[1].customer_last_read_at==='2026-10-04T12:00:00Z'));
  blocked=false;countError=true;assert.equal((await m.POST(req({message:'hello',name:'Guest',email:'guest@example.com'}))).status,503);
  assert(!reads.some(c=>c[0]==='insert'));
});
test('production CSP requires nonces and blocks embedding/object execution; development alone allows eval',()=>{
  const {contentSecurityPolicy}=load('lib/content-security-policy.ts');const prod=contentSecurityPolicy('fixture',false),dev=contentSecurityPolicy('fixture',true);
  assert.match(prod,/script-src 'self' 'nonce-fixture' 'strict-dynamic';/);assert.match(prod,/object-src 'none'/);assert.match(prod,/frame-ancestors 'none'/);assert(!prod.includes('unsafe-eval'));assert(dev.includes('unsafe-eval'));
});
test('CSP forwards a fresh nonce without dropping refreshed authentication cookies',async()=>{
  const next={...NextResponse,next:options=>{const response=NextResponse.next(options);response.forwarded=new Headers(options.request.headers);return response;}};
  const ssr = { createServerClient(_url, _key, options) {
    return { auth: { async getUser() {
      options.cookies.setAll([{name:'fixture-auth',value:'refreshed',options:{httpOnly:true}}]);
      return {data:{user:null}};
    } } };
  } };
  const m=load('proxy.ts',{
    'next/server':{NextResponse:next},
    '@/lib/content-security-policy':load('lib/content-security-policy.ts'),
    '@/lib/affiliate-link-expiry':{isExpiredAffiliateLink:()=>false},
    '@/lib/admin-assurance':{},'@/lib/password-expiry':{},'@supabase/ssr':ssr,
  },{NEXT_PUBLIC_SUPABASE_URL:'https://fixture.invalid',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'fixture'});
  const first=await m.proxy(new NextRequest('https://shop.test/track-order',{headers:{cookie:'fixture-auth=old'}}));
  const second=await m.proxy(new NextRequest('https://shop.test/track-order'));
  assert.notEqual(first.forwarded.get('x-nonce'),second.forwarded.get('x-nonce'));
  assert.equal(first.forwarded.get('cookie'),'fixture-auth=refreshed');assert.equal(first.cookies.get('fixture-auth').value,'refreshed');
  assert(first.headers.get('Content-Security-Policy').includes(first.forwarded.get('x-nonce')));
});
