const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),test=require('node:test');
function loader(overrides={}){const cache=new Map();return function load(file){file=path.resolve(file);if(cache.has(file))return cache.get(file);const exports={};cache.set(file,exports);const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const req=n=>Object.hasOwn(overrides,n)?overrides[n]:n==='server-only'?{}:n.startsWith('@/')?load(n.slice(2)+'.ts'):n.startsWith('.')?load(path.resolve(path.dirname(file),n)+'.ts'):require(n);vm.runInThisContext('(function(exports,require){'+code+'\n})',{filename:file})(exports,req);return exports;}}
const data=loader()('lib/customer-report-data.ts');
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0'),date='2026-10-01T00:00:00.000Z';
function mockDb(verified=true){
 const account=id(1),other=id(2),base={created_at:date,currency:'USD',subtotal:10,discount:0,total:10,status:'DELIVERED',paid_at:date,delivered_at:date};
 const tables={customer_wallets:[{user_id:account,balance:6,currency:'USD',created_at:date,updated_at:date}],customer_login_activity:[],wallet_transactions:[
 {id:id(20),user_id:account,created_at:date,transaction_type:'CREDIT',amount:10,balance_before:0,balance_after:10,order_id:null},
 {id:id(21),user_id:account,created_at:'2026-10-02T00:00:00Z',transaction_type:'DEBIT',amount:4,balance_before:10,balance_after:6,order_id:id(13)}],
 wallet_topup_requests:[{id:id(22),created_at:date,user_id:account,amount:500,currency:'USD',payment_method:'PALLY',status:'REJECTED'}],
 orders:[{...base,id:id(10),customer_id:account,customer_email:'old@example.com',order_number:'ACCOUNT'},
 {...base,id:id(11),customer_id:null,customer_email:'a_test@example.com',order_number:'GUEST'},
 {...base,id:id(12),customer_id:other,customer_email:'a_test@example.com',order_number:'OTHER'},
 {...base,id:id(13),customer_id:null,customer_email:'old@example.com',order_number:'WALLET'}],
 order_items:[{id:id(30),created_at:date,order_id:id(10),product_name:'Test product',option_name:'100 INR',quantity:501,unit_price:1,total_price:501,products:{slug:'test',region:'India'},product_options:{denomination_currency:'INR'},service_delivered_at:null}],
 customer_login_events:[{id:id(40),user_id:account,created_at:date,ip_address:"203.0.113.7",country_code:"NL",region:null,city:null,browser_id:id(99),device_details:{device_type:"mobile",os:"Android",browser:"Chrome 144",brand:"Samsung",model:"SM-S918B",model_source:"client-hint"},user_agent:"Test browser",event_type:"PASSWORD_SIGN_IN"}],auth_audit:[],auth_sessions:[],payments:[],gift_card_codes:Array.from({length:501},(_,i)=>({id:id(1000+i),order_item_id:id(30),created_at:date,status:'SOLD'})),order_item_refunds:[]};
 const selects=[];
 return {rpc(name,args){assert(['customer_report_login_history','customer_report_device_history'].includes(name));if(name==='customer_report_device_history')return this.from('customer_login_events').eq('user_id',args.p_customer_id);assert.equal(args.p_customer_id,account);return this.from(args.p_source==='WEBSITE'?'customer_login_events':args.p_source==='AUTH_AUDIT'?'auth_audit':'auth_sessions').eq('user_id',args.p_customer_id);},selects,auth:{admin:{getUserById:async()=>({data:{user:{id:account,email:'a_test@example.com',email_confirmed_at:verified?date:null,phone:'+123',phone_confirmed_at:date,user_metadata:{name:'Иван Петров',phone:'+456'},created_at:date,last_sign_in_at:date}},error:null})}},from(table){let rows=[...(tables[table]||[])];const q={
 select(s){selects.push([table,s]);return q;},eq(k,v){rows=rows.filter(r=>r[k]===v);return q;},is(k,v){return q.eq(k,v);},in(k,values){rows=rows.filter(r=>values.includes(r[k]));return q;},lte(k,v){rows=rows.filter(r=>Date.parse(r[k])<=Date.parse(v));return q;},ilike(k,v){assert.equal(v,'a\\_test@example.com');rows=rows.filter(r=>r[k].toLowerCase()===v.replace(/\\/g,'').toLowerCase());return q;},or(cursor){if(cursor!=='id.not.is.null'){const m=cursor.match(/^created_at.gt.(.+),and\(created_at.eq.(.+),id.gt.(.+)\)$/);assert(m);rows=rows.filter(r=>r.created_at>m[1]||(r.created_at===m[1]&&r.id>m[3]));}return q;},order(){return q;},limit(){return q;},maybeSingle(){return Promise.resolve({data:rows[0]||null,error:null});},then(resolve,reject){return Promise.resolve({data:rows.sort((a,b)=>a.created_at.localeCompare(b.created_at)||a.id.localeCompare(b.id)).slice(0,2),error:null}).then(resolve,reject);}};return q;}};
}
test('reads beyond server page cap, counts 501 deliveries, isolates identities and reconciles money',async()=>{
 const db=mockDb(),r=await data.loadCustomerReport(db,id(1),'UTC');
 assert.deepEqual(r.orders.map(o=>o.order_number),['ACCOUNT','GUEST','WALLET']);assert.equal(r.orders[0].items[0].deliveredCodes,501);
 assert.equal(r.orders[1].identityMatch,'guest-email');assert.equal(r.orders[2].identityMatch,'wallet');
 assert.deepEqual(r.wallet.summary,{userId:id(1),opening:0,credit:1000,debit:400,closing:600});assert.equal(r.wallet.reconciled,true);
 assert.equal(r.network.deviceStatus,'available');assert.equal(r.network.events[0].browser_id,id(99));assert.equal(r.network.events[0].device_details.model,'SM-S918B');assert.equal(r.network.events[0].ip_address,'203.0.113.7');assert.equal(r.network.events[0].source,'WEBSITE');assert.equal(r.topups[0].status,'REJECTED');assert.equal(r.customer.phoneVerified,false);
 assert(db.selects.filter(([table])=>table==='gift_card_codes').every(([,columns])=>columns==='id,order_item_id,created_at'));
 const unverified=await data.loadCustomerReport(mockDb(false),id(1),'UTC');assert(!unverified.orders.some(o=>o.order_number==='GUEST'));
});
test('stops on partial-page errors, repeated cursors, aborts and invalid time zones',async()=>{
 let call=0;await assert.rejects(data.readReportRows(async()=>++call===1?{data:[{id:id(3),created_at:date}],error:null}:{data:null,error:{message:'SECRET DATABASE DETAILS'}}),/No partial report/);
 await assert.rejects(data.readReportRows(async()=>({data:[{id:id(3),created_at:date}],error:null})),/finish reading/);
 const abort=new AbortController();abort.abort();await assert.rejects(data.readReportRows(async()=>{throw Error('should not query');},abort.signal),e=>e.name==='AbortError');
 await assert.rejects(data.loadCustomerReport(mockDb(),id(1),'bad-zone'),/valid report time zone/);
});
test('report endpoint blocks anonymous, non-admin and insufficient MFA before service access',async()=>{
 let signed=true,admin=true,mfa=true,origin=true,serviceCalls=0,failure=false;
 const session={auth:{getUser:async()=>({data:{user:signed?{id:id(1)}:null},error:null})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:admin?{user_id:id(1)}:null,error:null})})})})};
 const route=loader({'@/lib/supabase/server':{createClient:async()=>session},'@/lib/supabase/admin':{createAdminClient:()=>{serviceCalls++;return {}; }},'@/lib/admin-assurance':{hasRequiredAdminAssurance:async()=>mfa},'@/lib/request-security':{sameOrigin:()=>origin},'@/lib/customer-report-data':{...data,loadCustomerReport:async()=>{if(failure)throw Error('SECRET DATABASE DETAILS');return {generatedAt:date};}},'@/lib/customer-report-pdf':{createCustomerReportPdf:async()=>Buffer.from('%PDF-1.7\n')}})('app/admin/customers/[id]/report/route.ts');
 const get=(suffix='',customer=id(1))=>route.GET(new Request('https://www.ingamepin.com/admin/customers/'+customer+'/report'+suffix),{params:Promise.resolve({id:customer})});
 signed=false;assert.equal((await get()).status,401);signed=true;admin=false;assert.equal((await get()).status,403);admin=true;mfa=false;assert.equal((await get()).status,403);mfa=true;origin=false;assert.equal((await get()).status,403);origin=true;
 assert.equal((await get('?timezone=invalid')).status,400);assert.equal((await get('?timezone=UTC&timezone=UTC')).status,400);assert.equal((await get('','invalid')).status,400);assert.equal(serviceCalls,0);
 const ok=await get('?timezone=Europe%2FMoscow');assert.equal(ok.status,200);assert.equal(ok.headers.get('content-type'),'application/pdf');assert.match(ok.headers.get('cache-control'),/private, no-store/);assert.match(ok.headers.get('content-disposition'),/^attachment/);
 failure=true;const bad=await get();assert.equal(bad.status,503);assert(!JSON.stringify(await bad.json()).includes('SECRET'));
});
test('PDF preserves multilingual text, long rows and multi-page histories',async()=>{
 const r=await data.loadCustomerReport(mockDb(),id(1),'Europe/Moscow');r.customer.name='Иван Петров';r.orders[0].items[0].product_name='Подарочная карта '+('long product name '.repeat(70));
 r.transactions=Array.from({length:100},(_,i)=>({...r.transactions[0],id:id(2000+i),description:'Entry '+i,reference_id:'reference-'+i}));
 const pdf=await loader()('lib/customer-report-pdf.ts').createCustomerReportPdf(r);const loaded=await require('pdf-lib').PDFDocument.load(pdf);assert(loaded.getPageCount()>5);assert(loaded.getPageCount()<40);
 fs.mkdirSync('tmp/pdfs',{recursive:true});fs.writeFileSync('tmp/pdfs/customer-report-test.pdf',pdf);
 r.orders=[];r.transactions=[];r.topups=[];const empty=await loader()('lib/customer-report-pdf.ts').createCustomerReportPdf(r);assert.equal((await require('pdf-lib').PDFDocument.load(empty)).getPageCount(),6);
});

test('login IP capture trusts the platform IP and does not break sign-in if logging fails',async()=>{
 const before=process.env.VERCEL;process.env.VERCEL='1';const saved=[];let fail=false;
 const log=loader({'@/lib/customer-browser-id':{customerBrowserId:async()=>id(99)},'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>({insert:async row=>{saved.push(row);return {error:fail?{message:'private database details'}:null};}})})},'@/lib/trusted-client-ip':{trustedClientIp:headers=>headers.get('x-vercel-forwarded-for')}})('lib/customer-login-activity.ts');
 const headers=new Headers({'x-vercel-forwarded-for':'203.0.113.4','x-forwarded-for':'198.51.100.99','cf-ipcountry':'RU','x-vercel-ip-country':'NL','x-vercel-ip-city':'The%20Hague','user-agent':'Browser'});
 const warn=console.warn;try{
 await log.recordCustomerLogin(id(1),null,headers,'PASSWORD_SIGN_IN');assert.equal(saved[0].browser_id,id(99));assert.equal(saved[0].device_details.model,null);assert.equal(saved[0].ip_address,'203.0.113.4');assert.equal(saved[0].country_code,'NL');assert.equal(saved[0].city,'The Hague');assert.equal(saved[0].event_type,'PASSWORD_SIGN_IN');
 fail=true;console.warn=()=>{};await log.recordCustomerLogin(id(1),null,headers,'SESSION_OBSERVED');
 delete process.env.VERCEL;await log.recordCustomerLogin(id(1),null,headers);assert.equal(saved.length,2);
 }finally{console.warn=warn;if(before===undefined)delete process.env.VERCEL;else process.env.VERCEL=before;}
});
test('missing IP setup is explicit and unexpected history errors do not create partial reports',async()=>{
 const db=mockDb();db.rpc=()=>{const q={lte:()=>q,or:()=>q,order:()=>q,limit:async()=>({data:null,error:{code:'PGRST202'}})};return q;};
 const report=await data.loadCustomerReport(db,id(1),'UTC');assert.equal(report.network.status,'setup-required');assert.equal(report.network.events.length,0);
 db.rpc=()=>{const q={lte:()=>q,or:()=>q,order:()=>q,limit:async()=>({data:null,error:{code:'42501',message:'secret'}})};return q;};
 await assert.rejects(data.loadCustomerReport(db,id(1),'UTC'),/No partial report/);
});
