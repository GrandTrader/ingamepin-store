const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript');
function load(file, mocks = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
    exports, require: name => name === 'server-only' ? {} : mocks[name] ?? require(name), Map, Date,
  });
  return exports;
}
const finance = load('lib/affiliate-directory-finance.ts');
const totals = finance.emptyPromoterFinance();
for (const status of ['PENDING','AVAILABLE','REQUESTED','PAID','HELD','REJECTED','CANCELLED']) {
  finance.addPromoterCommission(totals, {status, commission_amount:'0.10'});
}
assert.equal(totals.earnedCents,40);
assert.equal(totals.availableCents,10);
assert.equal(totals.pendingCents,10);
assert.equal(totals.heldCents,10);
for (const [index,status] of ['PAID','PENDING','APPROVED','REJECTED','CANCELLED'].entries()) {
  finance.addPromoterPayout(totals, {status,net_amount:'9.25',created_at:`2026-10-0${index+1}T00:00:00Z`,network:'TRC20'});
}
assert.equal(totals.paidOutCents,925,'Only completed payouts count as paid');
assert.equal(totals.pendingPayoutCents,1850,'Only pending and approved requests count as pending');
assert.equal(totals.earnedCents,40,'Payouts must not double-count earnings');
assert.equal(totals.latestPayout.status,'CANCELLED');
finance.addPromoterPayout(totals,{status:'PAID',net_amount:'1',created_at:'2026-01-01T00:00:00Z',network:'BEP20'});
assert.equal(totals.latestPayout.status,'CANCELLED','Older requests must not replace the latest request');

const accounts = [{id:'a',user_id:'u1',status:'APPROVED'}, {id:'b',user_id:'u2',status:'APPROVED'}];
const commissions = Array.from({length:1001},(_,i)=>({id:`c${i}`,affiliate_id:'a',status:'AVAILABLE',commission_amount:'0.01'}));
commissions.push({id:'other',affiliate_id:'b',status:'PENDING',commission_amount:'3'});
const payouts = [{id:'pay',affiliate_id:'b',net_amount:'7',status:'PAID',created_at:'2026-10-01',network:'TRC20'}];
const calls=[];
let failTable=null;
const admin = {
  auth:{admin:{getUserById:async id=>({data:{user:{email:`${id}@example.invalid`}},error:null})}},
  from(table){
    let ids;
    return {select(){return this},eq(){return this},neq(){return this},order(){return this},in(column,value){assert.equal(column,'affiliate_id');ids=value;return this},
      async range(start,end){
        calls.push({table,start});
        if(table===failTable)return {error:{message:'offline'},data:null};
        let rows=table==='affiliate_accounts'?accounts:table==='affiliate_commissions'?commissions:payouts;
        if(table!=='affiliate_accounts'){assert.ok(ids);rows=rows.filter(row=>ids.includes(row.affiliate_id));}
        return {data:rows.slice(start,end+1),error:null};
      }
    };
  }
};
const loader=load('lib/admin-affiliate-promoters.ts',{'@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/affiliate-directory-finance':finance});
(async()=>{
  const result=await loader.loadAffiliatePromoters('approved');
  assert.equal(result[0].finance.availableCents,1001,'All pages must be included');
  assert.equal(result[0].finance.paidOutCents,0);
  assert.equal(result[1].finance.availableCents,0);
  assert.equal(result[1].finance.pendingCents,300);
  assert.equal(result[1].finance.paidOutCents,700,'Keep different promoters separate');
  assert.ok(calls.some(call=>call.table==='affiliate_commissions'&&call.start===1000));
  failTable='affiliate_payout_requests';
  await assert.rejects(()=>loader.loadAffiliatePromoters('approved'),/Unable to load promoter payouts/);
  console.log('PASS: earnings states, net payout totals, latest request, promoter isolation, pagination and failed-query handling.');
})().catch(error=>{console.error(error);process.exitCode=1});
