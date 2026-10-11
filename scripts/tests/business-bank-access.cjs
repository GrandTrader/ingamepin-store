const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(n in mocks)return mocks[n];throw Error('Unexpected module '+n)},FormData,Error,Number,String},{filename:file});return exports;}
const uid='00000000-0000-4000-8000-000000000010',admin='00000000-0000-4000-8000-000000000011';
const adminMocks={'@/lib/business-api-input':{},'@/lib/business-setup-email':{},'@/lib/business-interest':{},'@/lib/admin-business-profile':{},'@/lib/business-verification':{}};
test('Switch binds real administrator, validates values, reports database errors and invalidates both account routes',async()=>{
 const calls=[],paths=[];let error=null;const action=load('app/admin/business-verification/actions.ts',{...adminMocks,'next/cache':{revalidatePath:(...p)=>paths.push(p)},'@/lib/business-verification-data':{requireBusinessAdmin:async()=>({id:admin})},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:8,error}}})}}).setBusinessBankTransferAccess;
 const f=new FormData();f.set('user_id',uid);f.set('revision','7');f.set('enabled','false');f.set('p_admin','forged');
 assert.equal((await action(f)).revision,8);assert.equal(calls[0].args.p_admin,admin);assert.equal(calls[0].args.p_user,uid);assert.equal(calls[0].args.p_enabled,false);assert.equal(calls[0].args.p_revision,7);
 assert(paths.some(p=>p[0]==='/account/portal/business'&&p[1]==='layout'));assert(paths.some(p=>p[0]==='/account/business'&&p[1]==='layout'));
 for(const [key,value]of [['user_id','bad'],['revision','0'],['revision','1.5'],['enabled','yes']]){const before=calls.length,old=f.get(key);f.set(key,value);assert((await action(f)).error);assert.equal(calls.length,before);f.set(key,old);}
 paths.length=0;error={code:'P0001',message:'Account changed'};assert.equal((await action(f)).error,'Account changed');assert.equal(paths.length,0);
 error={code:'OTHER',message:'Sensitive database detail'};assert(!((await action(f)).error.includes('Sensitive')));
});
test('Unauthorized users cannot toggle any customer',async()=>{
 const action=load('app/admin/business-verification/actions.ts',{...adminMocks,'next/cache':{},'@/lib/business-verification-data':{requireBusinessAdmin:async()=>{throw Error('Unauthorized')}},'@/lib/supabase/admin':{}}).setBusinessBankTransferAccess;
 await assert.rejects(action(new FormData()),/Unauthorized/);
});
test('Customer bank access fails closed on missing, revoked, disabled and database errors',async()=>{
 let data={status:'APPROVED',bank_transfer_enabled:true},error=null,target;
 const q={select(){return this},eq(k,v){target=v;return this},async maybeSingle(){return {data,error}}};
 const check=load('lib/business-bank-access.ts',{'server-only':{},'@/lib/supabase/admin':{createAdminClient:()=>({from:()=>q})}}).requireBusinessBankTransfer;
 await check(uid);assert.equal(target,uid);
 for(const status of ['REVOKED','PENDING']){data={status,bank_transfer_enabled:true};await assert.rejects(check(uid),/Approved/);}
 for(const enabled of [false,undefined,null]){data={status:'APPROVED',bank_transfer_enabled:enabled};await assert.rejects(check(uid),/disabled/);}
 data=null;await assert.rejects(check(uid),/Approved/);error={message:'DB failed'};await assert.rejects(check(uid),/Unable to check/);
});
test('All customer submission actions block disabled access before uploads or bank RPCs',async()=>{
 let checked=[];const denied=async user=>{checked.push(user);throw Error('Direct Bank Transfer is disabled')};
 const common={'@/lib/business-bank-access':{requireBusinessBankTransfer:denied},'@/lib/customer-account-data':{requireCustomer:async()=>({user:{id:uid}})},'@/lib/supabase/admin':{createAdminClient:()=>({from(){throw Error('Unexpected database read')},rpc(){throw Error('Unexpected RPC')},storage:{from(){throw Error('Unexpected upload')}}})},'node:crypto':{},'next/cache':{},'@/lib/business-verification':{readBusinessFile(){throw Error('Unexpected file processing')}}};
 const f=new FormData();f.set('amount','100');f.set('request_id',uid);f.set('invoice_id',uid);f.set('reference','BANK123');f.set('user_id','forged');
 const direct=load('app/account/business/actions.ts',{...common,'@/lib/business-interest':{}});
 assert.match((await direct.submitBusinessDeposit(f)).error,/disabled/);
 const invoice=load('app/account/business/invoices/actions.ts',{...common,'@/lib/invoice-billing':{},'@/lib/business-security':{businessSessionReady:async()=>true},'@/lib/supabase/server':{createClient:async()=>({})},'@/lib/bank-deposit-invoice':{bankInvoiceAmount:()=>100,bankInvoiceId:/^[a-f0-9-]{36}$/i}});
 assert.match((await invoice.generateBankInvoice(f)).error,/disabled/);assert.match((await invoice.submitInvoiceTransfer(f)).error,/disabled/);assert.deepEqual(checked,[uid,uid,uid]);
});
