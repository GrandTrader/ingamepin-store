// Isolated API tests: no live database, email or Telegram calls.
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const { NextRequest, NextResponse } = require('next/server');
function load(file, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
    {exports, require:n=>n in mocks?mocks[n]:require(n), process:{env:{NODE_ENV:'production'}}, console:{error(){}}, Date}, {filename:file});
  return exports;
}
const validation = load('lib/contact-form.ts');
const input = {source:'contact',name:'Test Customer',email:'customer@example.com',subject:'Delivery enquiry',orderNumber:'IGP12345',message:'Please check my order.',website:''};
const conversation = {id:'existing',customer_name:input.name,customer_email:input.email,status:'OPEN',last_message_at:'2026-10-09T01:00:00Z'};
function fixture(options = {}) {
  const calls = [], notifications = [];
  const db = {from(table) {
    const operations = [];
    const q = {};
    for(const method of ['select','order','limit','eq','gte','update','insert']) q[method] = (...args) => { operations.push([method,...args]); return q; };
    function result() {
      calls.push({table,operations});
      const insert = operations.find(o=>o[0]==='insert')?.[1];
      if (table==='support_conversations') {
        if(insert) return {data:{...conversation,...insert,id:'new'},error:options.createError?{message:'offline'}:null};
        if(operations.some(o=>o[0]==='update')) return {data:{...conversation,...options.existing,status:'OPEN'},error:null};
        return {data:options.existing??null,error:null};
      }
      if(insert) return {data:{id:'message',...insert,created_at:'2026-10-09T02:00:00Z'},error:options.saveError?{message:'offline'}:null};
      return {count:options.count??0,error:options.countError?{message:'offline'}:null};
    }
    q.single=q.maybeSingle=async()=>result();
    q.then=(resolve,reject)=>Promise.resolve(result()).then(resolve,reject);
    return q;
  }};
  const route=load('app/api/support/chat/route.ts',{
    'next/headers':{cookies:async()=>({get:()=>options.cookie?{value:options.cookie}:undefined})},
    'next/server':{NextRequest,NextResponse},
    '@/lib/contact-form':validation,
    '@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:options.user??null}})}})},
    '@/lib/supabase/admin':{createAdminClient:()=>db},
    '@/lib/support-chat':{cleanSupportText:(v,max=2000)=>String(v??'').trim().slice(0,max),createSupportToken:()=> 'fixture-token',hashSupportToken:s=>'hashed-'+s,SUPPORT_COOKIE:'igp_support_token'},
    '@/lib/request-security':{sameOrigin:()=>!options.crossOrigin,requestLimit:async()=>options.blocked?NextResponse.json({error:'rate limit'},{status:429}):null,consumeRate:async()=>!options.identityBlocked,privateJson:(body,status=200)=>NextResponse.json(body,{status})},
    '@/lib/telegram-chat-notification':{notifyNewSupportMessage:async message=>notifications.push(message)},
  });
  return {calls,notifications,send:body=>route.POST(new NextRequest('https://shop.test/api/support/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:typeof body==='string'?body:JSON.stringify(body)}))};
}
test('contact validation rejects invalid fields, overlong inputs and honeypot without writes',async()=>{
  for(const body of [null,[], '{bad json', {...input,name:''},{...input,email:'wrong'},{...input,email:'x\r\n@example.com'}, {...input,subject:' '},{...input,subject:'x'.repeat(121)}, {...input,orderNumber:'x'.repeat(81)}, {...input,message:' '},{...input,message:'x'.repeat(1501)}, {...input,website:'spam'}]) {
    const f=fixture(); assert.equal((await f.send(body)).status,400,JSON.stringify(body)); assert.equal(f.calls.length,0); assert.equal(f.notifications.length,0);
  }
});
test('guest contact enquiry reaches the existing support inbox with subject and order reference',async()=>{
  const f=fixture(); const response=await f.send({...input,email:' CUSTOMER@EXAMPLE.COM '}); assert.equal(response.status,200);
  const body=await response.json(); assert.equal(body.conversation.customer_email,input.email); assert.equal(body.message.id,'message');
  assert.equal(f.notifications.length,1); assert.match(f.notifications[0].message,/\[Contact form\]\nSubject: Delivery enquiry\nOrder number: IGP12345\n\nPlease check my order\./);
  const record=f.calls.find(c=>c.table==='support_conversations'&&c.operations.some(o=>o[0]==='insert')).operations.find(o=>o[0]==='insert')[1];
  assert.equal(record.guest_token_hash,'hashed-fixture-token'); assert.equal(record.customer_id,null);
  const cookie=response.cookies.get('igp_support_token'); assert.equal(cookie.httpOnly,true); assert.equal(cookie.secure,true); assert.equal(cookie.sameSite,'lax');
});
test('existing matching conversation is reused; changed reply details never overwrite earlier enquiries',async()=>{
  for(const existing of [conversation,{...conversation,customer_email:'old@example.com'},{...conversation,status:'CLOSED'}]) {
    const f=fixture({existing,cookie:'owned-token'}),response=await f.send(input); assert.equal(response.status,200);
    const created=f.calls.some(c=>c.table==='support_conversations'&&c.operations.some(o=>o[0]==='insert'));
    assert.equal(created,existing.customer_email!==input.email);
    assert.equal(f.notifications[0].customerEmail,input.email);
    assert(!f.calls.some(c=>c.operations.some(o=>o[0]==='update'&&('customer_email' in o[1]))));
    if(created) {
      assert.equal(response.cookies.get('igp_support_token').value,'fixture-token','New contact details rotate the guest conversation token');
      const inserted=f.calls.find(c=>c.table==='support_conversations'&&c.operations.some(o=>o[0]==='insert')).operations.find(o=>o[0]==='insert')[1];
      assert.equal(inserted.guest_token_hash,'hashed-fixture-token');assert.notEqual(inserted.guest_token_hash,'hashed-owned-token','Existing unique token must not be reused');
    } else assert.equal(response.cookies.get('igp_support_token'),undefined);
  }
});
test('signed-in account email is authoritative despite a supplied alternate email',async()=>{
  const f=fixture({user:{id:'user-1',email:'owner@example.com',user_metadata:{full_name:'Account Name'}}});
  const response=await f.send({...input,email:'someone-else@example.com'}); assert.equal(response.status,200);
  assert.equal((await response.json()).conversation.customer_email,'owner@example.com'); assert.equal(f.notifications[0].customerEmail,'owner@example.com');
  const record=f.calls.find(c=>c.table==='support_conversations'&&c.operations.some(o=>o[0]==='insert')).operations.find(o=>o[0]==='insert')[1];
  assert.equal(record.customer_id,'user-1'); assert.equal(record.guest_token_hash,null);
});
test('security limits and storage failures never report success or send notifications',async()=>{
  for(const [options,status] of [[{crossOrigin:true},403],[{blocked:true},429],[{identityBlocked:true},429],[{count:10},429],[{countError:true},503],[{createError:true},500],[{saveError:true},500]]) {
    const f=fixture(options); assert.equal((await f.send(input)).status,status); assert.equal(f.notifications.length,0);
  }
});
test('normal chat messages retain their existing format and authenticated conversation ownership',async()=>{
  const f=fixture({existing:conversation,user:{id:'user-1',email:input.email}});
  assert.equal((await f.send({message:'Hello from chat'})).status,200); assert.equal(f.notifications[0].message,'Hello from chat');
  assert(f.calls.some(c=>c.operations.some(o=>o[0]==='eq'&&o[1]==='customer_id'&&o[2]==='user-1')));
});
