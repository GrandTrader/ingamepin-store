const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={},globals={}){const exports={};const js=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;vm.runInNewContext(js,{exports,URLSearchParams,FormData,console,require:name=>{if(name in mocks)return mocks[name];throw Error('Unexpected dependency '+name);},...globals});return exports;}
const order={orderId:'00000000-0000-4000-8000-000000000001',orderNumber:'IP-EMAIL-TEST',customerName:'Customer',customerEmail:'customer@example.invalid',total:10,currency:'USD',orderStatus:'DELIVERED'};
function mailer(){const sent=[];const q={select(){return q},eq(){return q},order(){return q},in(){return q},then(resolve,reject){return Promise.resolve({data:[]}).then(resolve,reject)}};const mail=load('lib/email.ts',{'server-only':{},'nodemailer':{default:{createTransport:()=>({sendMail:async message=>{sent.push(message);return {accepted:[message.to],rejected:[]}}})}},'@/lib/product-stock':{},'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>q})},'@/lib/payment-method-label':{formatPaymentMethod:()=> 'Wallet'}},{process:{env:{SMTP_USER:'support@ingamepin.com',SMTP_PASSWORD:'test-only',SMTP_FROM:'InGamePin <support@ingamepin.com>',SMTP_HOST:'smtp.example.invalid',SMTP_PORT:'465',ORDER_SMTP_USER:'noreply@ingamepin.com',ORDER_SMTP_PASSWORD:'test-only'}}});return {mail,sent};}
test('order events send admin copies to noreply and customer receipts only to the customer',async()=>{
 const {mail,sent}=mailer();
 const operations=[()=>mail.sendOrderCreatedEmails({...order,status:'PROCESSING',paymentMethod:'WALLET',items:[]}),...['PAYMENT_APPROVED','PAYMENT_REJECTED','PRODUCT_SENT','ORDER_DELIVERED'].map(event=>()=>mail.sendOrderStatusEmails({...order,event,deliveredItems:event==='PRODUCT_SENT'?[{productName:'Fixture card',optionName:'10',codes:['PRIVATE-FIXTURE-CODE']}]:[]})),()=>mail.sendWalletDebitEmails({...order,amount:10,balanceAfter:20})];
 for(const operation of operations){sent.length=0;const results=await operation();assert(results.every(r=>r.status==='fulfilled'));assert.deepEqual(sent.map(m=>m.to),['customer@example.invalid','noreply@ingamepin.com']);assert(sent.every(m=>m.replyTo==='support@ingamepin.com'));assert(!sent[1].html.includes('PRIVATE-FIXTURE-CODE'),'Admin routing must not forward delivered codes');}
 await mail.sendOrderStatusEmails({...order,event:'PRODUCT_SENT',deliveredItems:[{productName:'Fixture',optionName:'10',codes:['PRIVATE-FIXTURE-CODE']}]});assert(sent.at(-2).html.includes('PRIVATE-FIXTURE-CODE'));
});
test('receipt distinguishes unpaid, review, paid and closed orders without changing the payable amount',async()=>{
 const {mail,sent}=mailer();
 for(const [status,badge,totalLabel] of [
  ['PENDING_PAYMENT','Awaiting payment','Total due'],
  ['PAYMENT_REVIEW','Payment under review','Order total'],
  ['PAID','Payment confirmed','Total paid'],
  ['PROCESSING','Preparing your order','Total paid'],
  ['DELIVERED','Order completed','Total paid'],
  ['CANCELLED','Order cancelled','Order total'],
  ['REFUNDED','Order refunded','Order total'],
 ]) {
  sent.length=0;
  await mail.sendOrderCreatedEmails({...order,total:10.8,status,paymentMethod:'WALLET',items:[{productName:'Apple India',optionName:'100',denomination:100,platform:null,quantity:10}]});
  const receipt=sent[0];assert(receipt.html.includes(badge));assert(receipt.html.includes(totalLabel));assert(receipt.text.includes(totalLabel));assert(receipt.html.includes('$10.80'));
  if(totalLabel!=='Total paid')assert(!receipt.html.includes('Total paid'));
  if(['PAID','PROCESSING','DELIVERED'].includes(status))assert(!receipt.html.includes('Delivery starts after your payment is confirmed.'));
 }
});
test('receipt preserves multiple items and currencies, and escapes all visitor-controlled markup',async()=>{
 const {mail,sent}=mailer();
 await mail.sendOrderCreatedEmails({...order,orderNumber:'IP-<tag>"&',status:'PENDING_PAYMENT',currency:'GBP',total:22.5,paymentMethod:'WALLET',items:[
  {productName:'Apple <script>alert(1)</script>',optionName:'10 & bonus',denomination:10,platform:'<b>UK</b>',quantity:2},
  {productName:'Second item',optionName:null,denomination:5,platform:null,quantity:1},
 ]});
 const html=sent[0].html;assert(html.includes('£22.50'));assert(html.includes('GBP'));assert(html.includes('Second item'));assert(html.includes('Value: 5'));assert(html.includes('10 &amp; bonus'));assert(html.includes('&lt;script&gt;'));assert(!html.includes('<script>'));assert(html.includes('orderNumber=IP-%3Ctag%3E%22%26'));assert(html.includes('&amp;orderNumber='));
 assert(!/display\s*:\s*(flex|grid)/.test(html),'Email layout must not depend on flex or grid support');
});
test('rejection and delivered-code receipts keep the correct status and preserve private code bundles',async()=>{
 const {mail,sent}=mailer();
 await mail.sendOrderStatusEmails({...order,event:'PAYMENT_REJECTED',orderStatus:'PENDING_PAYMENT',reason:'Bad <img src=x>',customerName:'<b>Customer</b>'});
 assert(sent[0].html.includes('Payment not approved'));assert(!sent[0].html.includes('Total paid'));assert(sent[0].html.includes('Bad &lt;img src=x&gt;'));assert(!sent[0].html.includes('<b>Customer</b>'));
 sent.length=0;
 await mail.sendOrderStatusEmails({...order,event:'PRODUCT_SENT',deliveredItems:[{productName:'Voucher <x>',optionName:'Card + PIN',codes:['Card: TEST-0001\nPIN: 000042','<private-code>']} ]});
 assert(sent[0].html.includes('PIN: 000042'));assert(sent[0].html.includes('&lt;private-code&gt;'));assert(!sent[1].html.includes('TEST-0001'));assert(sent[0].html.includes('Order completed'));
});
test('support enquiries reach support even without Telegram and safely escape visitor content',async()=>{
 const sent=[];const api=load('lib/telegram-chat-notification.ts',{'server-only':{},'@/lib/admin-push':{notifyAdminsByPush:async()=>{throw Error('Push offline')}},'@/lib/email':{SUPPORT_EMAIL:'support@ingamepin.com',sendEmail:async message=>{sent.push(message);return {rejected:[]}}}},{process:{env:{}},console:{warn(){},error(){}}});
 const message={messageId:'m',conversationId:'c',customerName:'<img src=x>',customerEmail:'customer@example.invalid',message:'<script>not markup</script>'};
 await api.notifyNewSupportMessage(message);assert.equal(sent.length,1);assert.equal(sent[0].to,'support@ingamepin.com');assert.equal(sent[0].replyTo,'customer@example.invalid');assert(!sent[0].html.includes('<script>'));assert(!sent[0].html.includes('<img'));assert(sent[0].text.includes(message.message));
 await api.notifyNewSupportMessage({...message,customerEmail:'buyer@example.invalid\r\nBcc: another@example.invalid'});assert.equal(sent[1].replyTo,'support@ingamepin.com');
});
test('support SMTP rejection cannot fail an already saved chat message',async()=>{
 for(const failure of ['throw','reject']){const api=load('lib/telegram-chat-notification.ts',{'server-only':{},'@/lib/admin-push':{notifyAdminsByPush:async()=>{}},'@/lib/email':{SUPPORT_EMAIL:'support@ingamepin.com',sendEmail:async()=>{if(failure==='throw')throw Error('SMTP offline');return {rejected:['support@ingamepin.com']}}}},{process:{env:{}},console:{warn(){},error(){}}});await assert.doesNotReject(api.notifyNewSupportMessage({messageId:'m',conversationId:'c',customerName:'Customer',customerEmail:null,message:'Help'}));}
});
test('partnership enquiries use support and retain the visitor reply address',async()=>{
 const sent=[];const supplier=load('lib/supplier-application.ts');const api=load('app/work-with-us/actions.ts',{'next/navigation':{redirect:url=>{throw Error(url)}},'@/lib/supplier-application':supplier,'@/lib/email':{SUPPORT_EMAIL:'support@ingamepin.com',sendEmail:async m=>{sent.push(m);return {rejected:[]}}}});
 const form=new FormData();for(const[k,v]of Object.entries({partner_type:'PAYMENT_PROVIDER',company:'Example company',contact_name:'Example contact',email:'partner@example.invalid',country:'India',proposal:'Payment integration for your website.',consent:'yes'}))form.set(k,v);
 await assert.rejects(api.submitPartnerApplication(form),/success=1/);assert.equal(sent[0].to,'support@ingamepin.com');assert.equal(sent[0].replyTo,'partner@example.invalid');
});
