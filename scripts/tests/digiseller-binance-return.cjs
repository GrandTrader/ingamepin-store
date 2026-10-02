const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict'), ts = require('typescript');
(async () => {
  let payment, completeError, binanceError, binanceStatus, completeCalls, queryCalls;
  const reset = () => {
    payment = {gateway_invoice_id:'prepay',public_token:'test-token',return_url:'https://digiseller.me/order',checkout_url:'https://pay.binance.com/checkout',network:'BINANCE_PAY',status:'paid',transaction_hash:'transaction',digiseller_notified_at:null};
    completeError = null; binanceError = null; binanceStatus = 'PAID'; completeCalls = 0; queryCalls = 0;
  };
  class Response {
    constructor(body, init) { this.body = body; Object.assign(this, init); }
    static json(body, init) { return new Response(body, init); }
    static redirect(url, status) { return new Response(null, {location:url,status}); }
  }
  const db = {from(){ const q={select(){return q},eq(){return q},maybeSingle:async()=>({data:payment})}; return q; }};
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/digiseller/binance-pay/return/route.ts','utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText, {
    exports, URL, require:name=>({
      'next/server':{NextResponse:Response},
      '@/lib/supabase/admin':{createAdminClient:()=>db},
      '@/lib/digiseller-binance-pay':{completeDigisellerBinancePayment:async()=>{completeCalls++; if(completeError)throw completeError; return true;}},
      '@/lib/binance-pay':{callBinancePay:async()=>{queryCalls++; if(binanceError)throw binanceError; return {status:binanceStatus,prepayId:'prepay',transactionId:'transaction'};}},
    }[name]),
  });
  const get = (query='invoice_id=123&token=test-token') => { const url='https://www.ingamepin.com/api/digiseller/binance-pay/return?'+query; return exports.GET({url,nextUrl:new URL(url)}); };
  reset(); payment.digiseller_notified_at='2026-10-03'; let r=await get(); assert.equal(r.status,303); assert.equal(r.location,payment.return_url); assert.equal(queryCalls+completeCalls,0);
  reset(); completeError=new Error('Digiseller rejected the callback: Error: too busy, try again'); r=await get(); assert.equal(r.status,202); assert.match(r.body,/Payment received/); assert.match(r.body,/http-equiv="refresh"/); assert.doesNotMatch(r.body,/too busy|pay.binance.com/); assert.equal(queryCalls,0); assert.equal(completeCalls,1); assert.equal(r.headers['Cache-Control'],'no-store');
  r=await get('invoice_id=123&token=test-token&attempt=6'); assert.doesNotMatch(r.body,/http-equiv="refresh"/); assert.match(r.body,/Check confirmation/);
  completeError=null; r=await get(); assert.equal(r.status,303); assert.equal(r.location,payment.return_url);
  reset(); payment.status='waiting'; completeError=new Error('temporary'); r=await get(); assert.equal(queryCalls,1); assert.equal(r.status,202); assert.match(r.body,/Payment received/);
  reset(); payment.status='waiting'; r=await get(); assert.equal(r.status,303); assert.equal(r.location,payment.return_url); assert.equal(completeCalls,1);
  reset(); payment.status='waiting'; binanceStatus='INITIAL'; r=await get(); assert.equal(r.location,payment.checkout_url); assert.equal(completeCalls,0);
  reset(); payment.status='waiting'; binanceError=new Error('sensitive provider details'); r=await get(); assert.equal(r.status,202); assert.match(r.body,/Checking your payment/); assert.doesNotMatch(r.body,/sensitive provider details|Payment received/);
  reset(); r=await get('invoice_id=123&token=wrong'); assert.equal(r.status,403); assert.equal(queryCalls+completeCalls,0);
  r=await get('invoice_id=123'); assert.equal(r.status,400);
  reset(); payment.transaction_hash=null; r=await get(); assert.equal(r.status,202); assert.equal(queryCalls+completeCalls,0);
  console.log('Passed: paid redirects, busy confirmation recovery, bounded refresh, verified payment, unpaid checkout, safe errors and token validation.');
})().catch(error=>{console.error(error);process.exitCode=1});
