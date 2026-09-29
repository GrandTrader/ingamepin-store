const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,mocks){const mod={exports:{}};new Function('exports','require','module',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod.exports,n=>{if(n in mocks)return mocks[n];throw Error('Unexpected '+n)},mod);return mod.exports;}
const id='11111111-1111-4111-8111-111111111111';
const payload={orderId:id,itemId:id,codes:Array.from({length:100},(_,i)=>'TEST-CODE-'+i).join('\n'),adminUserId:'forged'};
function fixture({user={id:'real-admin'},assurance=true,access=true,saveError=false}={}){
 const calls=[];
 const session={auth:{getUser:async()=>({data:{user}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:access?{user_id:'real-admin'}:null})})};
 const {POST}=load('app/api/admin/orders/delivery/route.ts',{'next/server':{NextResponse:{json:(data,options)=>({data,...options})}},'@/lib/supabase/server':{createClient:async()=>session},'@/lib/admin-assurance':{hasRequiredAdminAssurance:async()=>assurance},'@/lib/manual-code-delivery':{saveManualDeliveryCodes:async(form,admin)=>{calls.push({form,admin});if(saveError)throw Error('lost response');return {error:'',success:'100 codes saved'};}}});
 const request=(body=payload,headers={})=>({nextUrl:new URL('https://www.ingamepin.com/api/admin/orders/delivery'),headers:new Headers({origin:'https://www.ingamepin.com','content-type':'application/json',...headers}),text:async()=>typeof body==='string'?body:JSON.stringify(body)});
 return {POST,request,calls};
}
test('100-code upload returns an uncached confirmation and uses authenticated admin identity',async()=>{const f=fixture(),r=await f.POST(f.request());assert.equal(r.status,200);assert.match(r.data.success,/100/);assert.match(r.headers['Cache-Control'],/no-store/);assert.equal(f.calls[0].admin,'real-admin');assert.equal(f.calls[0].form.get('codes'),payload.codes);});
test('Signed-out, unverified and non-admin sessions cannot upload',async()=>{for(const [options,status] of [[{user:null},401],[{assurance:false},401],[{access:false},403]]){const f=fixture(options);assert.equal((await f.POST(f.request())).status,status);assert.equal(f.calls.length,0);}});
test('Cross-origin requests, invalid content and oversized batches are rejected before delivery',async()=>{const f=fixture();for(const [body,headers,status] of [[payload,{origin:'https://evil.example'},403],[payload,{'sec-fetch-site':'cross-site'},403],[payload,{'content-type':'text/plain'},415],[payload,{'content-length':'2000000'},413],['bad json',{},400],[{...payload,itemId:'invalid'}, {},400],[{...payload,codes:''},{},400]]){assert.equal((await f.POST(f.request(body,headers))).status,status);}assert.equal(f.calls.length,0);});
test('Lost server result never falsely claims codes were not saved',async()=>{const f=fixture({saveError:true}),r=await f.POST(f.request());assert.equal(r.status,503);assert.match(r.data.error,/already saved codes will be skipped/);assert.equal(r.data.success,'');});
test('Saved batch retry uses the same atomic RPC and sends no duplicate notification',async()=>{
 let sent=0;const deferred=[],calls=[];
 const db={from(table){const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:{id,fulfillment_mode:'RANGE_MANUAL',products:{delivery_type:'AUTOMATIC'}}})};return q;},rpc:async(name,args)=>{calls.push({name,args});return {data:{codes:[],skipped:100}};}};
 const {saveManualDeliveryCodes}=load('lib/manual-code-delivery.ts',{'server-only':{},'next/server':{after:fn=>deferred.push(fn)},'next/cache':{revalidatePath(){}},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/email':{sendOrderStatusEmails:async()=>{sent++;return [];}}});
 const form=new FormData();form.set('order_id',id);form.set('item_id',id);form.set('codes',payload.codes);
 const result=await saveManualDeliveryCodes(form,'real-admin');assert.match(result.success,/already saved/);assert.equal(sent,0);assert.equal(deferred.length,0);assert.equal(calls[0].name,'deliver_manual_codes_batch');assert.equal(calls[0].args.p_codes.length,100);assert.equal(calls[0].args.p_admin_user_id,'real-admin');
 form.set('codes','DUPLICATE\nDUPLICATE');assert.match((await saveManualDeliveryCodes(form,'real-admin')).error,/Duplicate/);assert.equal(calls.length,1);
});
