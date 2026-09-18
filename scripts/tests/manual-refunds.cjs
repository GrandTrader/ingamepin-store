const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const exportsObject = {};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/manual-refund.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {exports:exportsObject});
const {parseManualRefund,manualRefundLabel}=exportsObject;
const order='11111111-1111-4111-8111-111111111111', item='22222222-2222-4222-8222-222222222222';
function form(overrides={}) {const f=new FormData();for(const [k,v] of Object.entries({order_id:order,item_id:item,quantity:'1',amount:'5.00',refund_destination:'WALLET',transaction_id:'REF-123',reason:'Already returned',refund_confirmed:'on',...overrides}))f.set(k,v);return f;}
test('manual refund accepts both destinations and rejects malformed submissions',()=>{
 for(const destination of ['WALLET','PAYMENT_METHOD'])assert.equal(parseManualRefund(form({refund_destination:destination})).destination,destination);
 for(const patch of [{order_id:'bad'},{item_id:'bad'},{quantity:'0'},{quantity:'1.2'},{quantity:'2147483648'},{amount:'-1'},{amount:'NaN'},{amount:'Infinity'},{amount:'0'},{amount:'1.001'},{refund_destination:'CASH'},{transaction_id:''},{reason:'x'},{refund_confirmed:''}])assert.throws(()=>parseManualRefund(form(patch)),JSON.stringify(patch));
});
test('manual labels distinguish partial, full, and cancelled refunds',()=>{
 const r={id:'r',quantity:1,amount:5,currency:'USD',status:'MANUALLY_REFUNDED'};
 assert.equal(manualRefundLabel([r],2),'Partially manually refunded');assert.equal(manualRefundLabel([r],1),'Manually refunded');
 assert.equal(manualRefundLabel([{...r,status:'CANCELLED'}],1),null);
});
test('manual action requires administrator before the only mutation and never credits wallets',async()=>{
 const actionSource=fs.readFileSync('app/admin/orders/actions.ts','utf8');
 let calls=[];let allowed=false;
 const session={auth:{getUser:async()=>({data:{user:allowed?{id:'admin'}:null}}),signOut:async()=>{}},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:{user_id:'admin'}})})};
 const mocks={'next/cache':{revalidatePath:()=>{}},'next/navigation':{redirect:url=>{throw Error(url)}},'@/lib/manual-refund':{parseManualRefund},'@/lib/supabase/admin-session':{createClient:async()=>session},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:'refund-id',error:null}}})}};
 const out={};vm.runInNewContext(ts.transpileModule(actionSource,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:out,require:n=>mocks[n]??{},console});
 await assert.rejects(()=>out.recordManualRefund(form()),/admin\/login/);assert.equal(calls.length,0);
 allowed=true;await assert.rejects(()=>out.recordManualRefund(form()),/success=/);assert.equal(calls.length,1);assert.equal(calls[0].name,'record_manual_item_refund');assert.equal(calls[0].args.p_admin_user_id,'admin');
});
