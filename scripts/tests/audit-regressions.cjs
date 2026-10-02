const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
function load(file,mocks={},globals={}) {
 const out={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:out,require:n=>{if(n in mocks)return mocks[n];throw Error('Unexpected dependency '+n)},console,URLSearchParams,...globals});return out;
}
function emails(env={}) {return load('lib/email.ts',{'server-only':{},'nodemailer':{default:{createTransport:()=>({sendMail:async()=>{throw Error('SMTP offline')}})}},'@/lib/product-stock':{},'@/lib/supabase/admin':{},'@/lib/payment-method-label':{formatPaymentMethod:()=> 'Wallet'}},{process:{env}});}
const order={orderId:'11111111-1111-4111-8111-111111111111',orderNumber:'IP20260929123456',customerName:'Customer',customerEmail:'customer@example.com',total:5,currency:'USD',orderStatus:'DELIVERED',event:'ORDER_DELIVERED'};
test('missing SMTP settings produce rejected notification results instead of failing a completed order',async()=>{
 const mail=emails();
 for(const result of [await mail.sendOrderStatusEmails(order),await mail.sendOrderCreatedEmails({...order,status:'PROCESSING',paymentMethod:'WALLET',items:[]}),await mail.sendWalletDebitEmails({...order,amount:5,balanceAfter:10})]) {
  assert.equal(result.length,2);assert.ok(result.every(r=>r.status==='rejected'&&/ORDER_SMTP_USER/.test(r.reason.message)));
 }
});
test('SMTP outage remains a notification failure for both recipients',async()=>{
 const result=await emails({ORDER_SMTP_USER:'orders@example.com',ORDER_SMTP_PASSWORD:'fixture',SMTP_HOST:'smtp.example.com',SMTP_PORT:'465'}).sendOrderStatusEmails(order);
 assert.equal(result.length,2);assert.ok(result.every(r=>r.status==='rejected'&&/SMTP offline/.test(r.reason.message)));
});
test('administrator verification uses enrolled factors and denies service errors or missing second factor',async()=>{
 const {hasRequiredAdminAssurance}=load('lib/admin-assurance.ts');
 for(const fixture of [{level:'aal1',factors:[{status:'verified'}],deny:true},{level:'aal2',factors:[],error:{message:'unavailable'},deny:true},{level:'aal2',factors:[{status:'verified'}],deny:false},{level:'aal1',factors:[],deny:true}]) {
  const session={auth:{getUser:async()=>({data:{user:{id:'admin'}}}),mfa:{getAuthenticatorAssuranceLevel:async()=>({data:{currentLevel:fixture.level,nextLevel:'aal1'}}),listFactors:async()=>({data:{all:fixture.factors},error:fixture.error})}},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{user_id:'admin'}})})};
  const mod=load('lib/seller-access.ts',{'server-only':{},'next/navigation':{redirect:url=>{throw Error(url)}},'@/lib/supabase/server':{createClient:async()=>session},'@/lib/admin-assurance':{hasRequiredAdminAssurance}});
  if(fixture.deny) await assert.rejects(mod.requireSellerAdministrator(),/admin\/login\/verify/);else assert.equal((await mod.requireSellerAdministrator()).id,'admin');
 }
});
test('manual completion succeeds only when a payable order was changed, even if SMTP is unconfigured',async()=>{
 for(const changed of [false,true]) {
  const invalidations=[];let notifications=0;
  const db={from(table){let update=false;const q={select(){return q},eq(){return q},in(){return q},neq(){return q},update(){update=true;return q},order(){return q},then(resolve,reject){return Promise.resolve(table==='order_items'?{data:[{id:'item',quantity:1,product_name:'Card',option_name:'5'}]}:table==='gift_card_codes'?{count:1,data:[{order_item_id:'item',code:'FIXTURE'}]}:{data:[]}).then(resolve,reject)},maybeSingle:async()=>({data:changed?{id:order.orderId}:null,error:null}),single:async()=>({data:{...order,order_number:order.orderNumber,customer_name:order.customerName,customer_email:order.customerEmail,status:'DELIVERED'}})};return q}};
  const session={auth:{getUser:async()=>({data:{user:{id:'admin'}}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{user_id:'admin'}})})};
  const imports=Object.fromEntries([...fs.readFileSync('app/admin/orders/actions.ts','utf8').matchAll(/from\s+"([^"]+)"/g)].map(m=>[m[1],{}]));
  Object.assign(imports,{'next/navigation':{redirect:url=>{throw Error(url)}},'next/cache':{revalidatePath:p=>invalidations.push(p)},'@/lib/supabase/admin-session':{createClient:async()=>session},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/email':{sendOrderStatusEmails:async input=>{notifications++;return emails().sendOrderStatusEmails(input)}}});
  const action=load('app/admin/orders/actions.ts',imports,{console:{error(){}}});const f=new FormData();f.set('order_id',order.orderId);
  await assert.rejects(action.finalizeManualOrderFromCodes(f),changed?/success=Order%20completed/:/error=/);
  assert.equal(notifications,changed?1:0);assert.equal(invalidations.length,changed?2:0);
 }
});
test('email-based account data requires a verified email before privileged reads',async()=>{
 for(const user of [null,{id:'u',email:'buyer@example.com'},{id:'u',email:'buyer@example.com',email_confirmed_at:'2026-09-29'}]) {
  let reads=0;
  const mod=load('lib/customer-account-data.ts',{'server-only':{},'next/navigation':{redirect:url=>{throw Error(url)}},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user}})}})},'@/lib/supabase/admin':{createAdminClient:()=>{reads++;throw Error('must not read before authorization')}}});
  if(!user?.email_confirmed_at)await assert.rejects(mod.requireCustomer(),/verified email/);else assert.equal((await mod.requireCustomer()).user.id,'u');
  assert.equal(reads,0);
 }
});
test('unverified sessions cannot read dashboard, invoices or wallet email-linked refunds',async()=>{
 for(const file of ['app/account/dashboard/page.tsx','app/account/orders/page.tsx','app/account/orders/OrderInvoice.tsx','app/account/wallet/WalletContent.tsx','app/account/orders/[id]/invoice/actions.ts']) {
  const source=fs.readFileSync(file,'utf8'),imports=Object.fromEntries([...source.matchAll(/from\s+"([^"]+)"/g)].map(m=>[m[1],{}]));
  imports['react/jsx-runtime']={};imports['i18n-iso-countries']={default:{registerLocale(){}}};
  Object.assign(imports,{'next/navigation':{redirect:url=>{throw Error('blocked '+url)}},'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'unverified',email:'owner@example.com'}}})}})},'@/lib/supabase/admin':{createAdminClient:()=>{throw Error('private read reached')}}});
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
  const out={};vm.runInNewContext(js,{exports:out,require:n=>imports[n]??{},console,URLSearchParams});
  if(file.endsWith('actions.ts'))assert.match((await out.saveCustomerInvoice('id',null,{})).error,/verified email/);
  else await assert.rejects(out.default({params:Promise.resolve({id:'id'}),searchParams:Promise.resolve({})}),/blocked/);
 }
});
test('legacy checkout uses the same handler, without a second path around purchase restrictions',()=>{
 const handler=()=>{};const route=load('app/api/binance-pay/orders/route.ts',{'@/app/api/orders/route':{POST:handler}});assert.equal(route.POST,handler);
});
test('private APIs receive explicit non-cacheable response headers',async()=>{
 const config=load('next.config.ts').default;const rules=await config.headers();
 for(const source of ['/api/customer-discounts','/api/wallet/:path*','/api/orders/:path*','/api/support/chat','/api/admin/:path*'])assert.ok(rules.some(r=>r.source===source&&r.headers.some(h=>h.key==='Cache-Control'&&h.value==='private, no-store')));
});
