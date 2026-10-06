const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, deps={}) {
 const exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,
 {exports, Error, Date, require:name=>{if(name in deps)return deps[name];throw Error('Unmocked '+name);}});
 return exports;
}
const product='11111111-1111-4111-8111-111111111111', option='22222222-2222-4222-8222-222222222222';
const item={operatorCode:'AMZN',currency:'INR',denominations:['500.00']};
const logic=load('lib/giftport-import.ts');
const pricing=load('lib/giftport-pricing.ts');
function harness({denied=false,ready=true,stale=false,linkAmount='500.00'}={}) {
 const calls=[];
 const api=load('app/admin/giftport/fulfillment-actions.ts',{
  'next/cache':{revalidatePath(){}},
  '@/lib/giftport-admin':{requireGiftPortAdmin:async()=>{calls.push(['auth']);if(denied)throw Error('denied');}},
  '@/lib/definiteplay-admin':{validProductId:v=>/^[a-f0-9-]{36}$/.test(v)},
  '@/lib/giftport-import':logic,
  '@/lib/giftport-pricing':pricing,
  '@/lib/giftport-relay':{getGiftPortStatus:async()=>({purchasingEnabled:true,fulfillmentReady:ready,stale,snapshot:{items:[item]}}),giftPortRequest:async()=>({mappings:[{option_id:option,operator_code:'AMZN',amount:linkAmount}]})},
  '@/lib/supabase/admin':{createAdminClient:()=>({
   from:table=>{const q={select:()=>q,eq:()=>q,then:r=>Promise.resolve({data:[{id:option,denomination:500,denomination_currency:'INR'}],error:null}).then(r),upsert:async row=>{calls.push(['save',table,row]);return {error:null};}};return q;},
   rpc:async(...args)=>{calls.push(['rpc',...args]);return {error:null};}
  })}
 }); return {api,calls};
}
function form(fields={}) {const f=new FormData();for(const [k,v] of Object.entries({discount:'5',limit:'10',...fields}))f.set(k,v);return f;}
test('recipient and activation actions require admin access before mutations',async()=>{
 const {api,calls}=harness({denied:true});
 await assert.rejects(api.saveGiftPortRecipient(form()),/denied/);
 await assert.rejects(api.configureGiftPortDelivery(product,true,form()),/denied/);
 assert.deepEqual(calls,[['auth'],['auth']]);
});
test('business recipient is validated and persisted without customer data',async()=>{
 const {api,calls}=harness();
 assert.ok((await api.saveGiftPortRecipient(form({name:'Business',email:'bad',mobile:'123'}))).error);
 assert.equal(calls.length,1);
 assert.equal((await api.saveGiftPortRecipient(form({name:'InGamePin',email:'Orders@Example.test',mobile:'9876543210'}))).success,true);
 const row=calls.at(-1)[2];assert.equal(row.recipient_email,'orders@example.test');assert.equal(row.mobile,'9876543210');
});
test('offline or stale supplier cannot activate purchasing',async()=>{
 for(const state of [{ready:false},{stale:true}]){
  const {api,calls}=harness(state);assert.ok((await api.configureGiftPortDelivery(product,true,form())).error);assert.equal(calls.some(c=>c[0]==='rpc'),false);
 }
});
test('invalid discounts and limits never reach configuration',async()=>{
 for(const values of [{discount:''},{discount:'NaN'},{discount:'-2'},{discount:'100'},{discount:'1.234'},{limit:'101'},{limit:'1.5'}]){
  const {api,calls}=harness();assert.ok((await api.configureGiftPortDelivery(product,true,form(values))).error);assert.equal(calls.some(c=>c[0]==='rpc'),false);
 }
});
test('changed denomination requires relinking before activation',async()=>{
 const {api,calls}=harness({linkAmount:'100'});assert.ok((await api.configureGiftPortDelivery(product,true,form())).error);assert.equal(calls.some(c=>c[0]==='rpc'),false);
});
test('activation delegates authoritative rate calculation to the database',async()=>{
 const {api,calls}=harness();assert.equal((await api.configureGiftPortDelivery(product,true,form())).success,true);
 const call=calls.find(c=>c[0]==='rpc');assert.equal(call[1],'configure_giftport_discount_product');
 assert.equal(call[2].p_mappings[0].unitCost,undefined);assert.equal(call[2].p_mappings[0].amount,'500.00');assert.equal(call[2].p_limit,10);assert.equal(call[2].p_discount,5);
});
test('disable remains available if supplier is offline',async()=>{
 const {api,calls}=harness({ready:false});assert.equal((await api.configureGiftPortDelivery(product,false,form())).success,true);assert.equal(calls.at(-1)[2].p_enabled,false);
});

test('saving pricing checks admin access and does not activate delivery',async()=>{
 const denied=harness({denied:true});await assert.rejects(denied.api.saveGiftPortPricing(product,form()),/denied/);
 const {api,calls}=harness();assert.equal((await api.saveGiftPortPricing(product,form({discount:'0'}))).success,true);
 assert.equal(calls.at(-1)[1],'save_giftport_pricing');assert.equal(calls.at(-1)[2].p_discount,0);
});
test('preview uses saved INR conversion and handles zero/fractional discounts',()=>{
 assert.equal(pricing.giftPortCostPreview(100,'0',100.5).usd.toFixed(8),'0.99502488');
 assert.equal(pricing.giftPortCostPreview(100,'5',100).usd,0.95);
 assert.equal(pricing.giftPortCostPreview(500,'2.5',100).inr,487.5);
 for(const rate of [null,0,-1,NaN,1001])assert.throws(()=>pricing.giftPortCostPreview(100,'0',rate));
});
