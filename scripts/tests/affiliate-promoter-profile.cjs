const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript');
function load(file, mocks = {}) { const exports = {}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>name==='server-only'?{}:name in mocks?mocks[name]:require(name),console,Date,Map,Set}); return exports; }
const limit = load('lib/affiliate-commission.ts');
const report = load('lib/affiliate-promoter-report.ts', {'./affiliate-commission':limit});
const states = ['PENDING','AVAILABLE','HELD','REQUESTED','PAID','REJECTED','CANCELLED'];
const commissions = states.map((status,index)=>({id:'c'+index,order_item_id:'i'+index,commission_amount:'0.10',status}));
const orders = [{id:'o1',status:'DELIVERED',order_items:[{id:'i0',affiliate_commission_percent:0},{id:'other',affiliate_commission_percent:0}]},{id:'o2',status:'REFUNDED',order_items:[{id:'i1',affiliate_commission_percent:2}]}];
const summary = report.summarizePromoter(commissions,orders);
assert.equal(summary.earned,0.4,'Held/reversed earnings must not inflate earned balance');
assert.equal(summary.balances.AVAILABLE,0.1);assert.equal(summary.paidOrders,1);
assert.equal(report.promoterSales(orders,commissions).length,2,'Unattributed basket items must be excluded; historical recorded commission preserved');
const product={status:'ACTIVE',retail_enabled:true,affiliate_enabled:true,affiliate_commission_percent:5};
assert.equal(report.promoterLinkStatus(product,true,'APPROVED',3,10).rate,3);
assert.equal(report.promoterLinkStatus(product,true,'APPROVED',null).active,true);
for(const args of [[product,false,'APPROVED',null],[product,true,'SUSPENDED',null],[{...product,status:'INACTIVE'},true,'APPROVED',null],[{...product,retail_enabled:false},true,'APPROVED',null],[{...product,affiliate_enabled:false},true,'APPROVED',null],[product,true,'APPROVED',0]]) assert.equal(report.promoterLinkStatus(...args).active,false);
(async()=>{
 let adminCalls=0;
 const profile=load('lib/admin-affiliate-profile.ts',{
  'next/navigation':{redirect:()=>{throw Error('redirect');},notFound:()=>{throw Error('notFound');}},
  '@/lib/supabase/admin-session':{createClient:async()=>({auth:{getUser:async()=>({data:{user:{id:'ordinary-user'}}})},from:()=>({select(){return this},eq(){return this},maybeSingle:async()=>({data:null,error:null})})})},
  '@/lib/supabase/admin':{createAdminClient:()=>{adminCalls++;throw Error('Forbidden');}}
 });
 await assert.rejects(()=>profile.loadAffiliateProfile('00000000-0000-4000-8000-000000000001'),/redirect/);
 assert.equal(adminCalls,0,'A non-admin must not access service-role data');
 let rpcCalls=0;
 const actions=load('app/account/affiliate/link-actions.ts',{'@/lib/supabase/server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:null},error:null})},rpc:async()=>{rpcCalls++;return {error:null}}})}});
 assert.equal((await actions.recordAffiliateLinkCopy('00000000-0000-4000-8000-000000000001')).recorded,false);assert.equal(rpcCalls,0);
 console.log('PASS: exact earnings totals, refund exclusion, attributed items, link eligibility, promoter rate caps, admin access and copy authentication.');
})().catch(e=>{console.error(e);process.exitCode=1});
