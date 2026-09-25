const assert = require('node:assert/strict');
const fs = require('node:fs');
const test = require('node:test');
const ts = require('typescript');
const mod = { exports: {} };
new Function('exports','require','module',ts.transpileModule(
  fs.readFileSync('lib/definiteplay-money.ts','utf8'),
  {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}
).outputText)(mod.exports,require,mod);
const {supplierMoney,readSupplierBalances,readSupplierPrice,assessSupplierFunds}=mod.exports;
const liveShape={Balances:{Balance:{USD:'1002.80'},Total:{USD:'1002.80'},'Available Balance':{GBP:'758.30'}}};

test('USD credit and GBP buying limit remain separate without conversion or double counting',()=>{
  const s=readSupplierBalances(liveShape);
  assert.deepEqual(s.accountBalance,{currency:'USD',amount:'1002.80'});
  assert.deepEqual(s.availableBalance,{currency:'GBP',amount:'758.30'});
  assert.equal(s.accountBalances.length,1);
  assert.equal(s.availableMatchesDisplayCurrency,false);
  for(const amount of ['500','800','1200']){
    assert.deepEqual(assessSupplierFunds(s,supplierMoney('USD',amount)),{status:'unknown',reason:'different_currencies'});
  }
});
test('same-currency order checks respect exact equality and decimals',()=>{
  const s=readSupplierBalances({Balances:{'Available Balance':{USD:'0.30'}}});
  assert.equal(assessSupplierFunds(s,supplierMoney('USD','0.30')).status,'sufficient');
  assert.equal(assessSupplierFunds(s,supplierMoney('USD','0.30000001')).status,'insufficient');
});
test('negative credit is blocked even across currencies; zero stays zero',()=>{
  const s=readSupplierBalances({Balances:{'Available Balance':{GBP:'-0.01'}}});
  assert.equal(assessSupplierFunds(s,supplierMoney('USD','1')).status,'insufficient');
  assert.equal(readSupplierBalances({Balances:{Balance:{USD:'0'},'Available Balance':{USD:'0'}}}).accountBalance.amount,'0.00');
});
test('account credit is never substituted for missing spendable balance',()=>{
  const s=readSupplierBalances({Balances:{Balance:{USD:'5000'}}});
  assert.equal(s.availableBalance,null);
  assert.equal(assessSupplierFunds(s,supplierMoney('USD','1')).status,'unknown');
});
test('aliases and thousands-separated order responses are parsed safely',()=>{
  assert.equal(readSupplierBalances({Balances:{Outstanding:{USD:'1,002.80'}}}).accountBalance.amount,'1002.80');
  assert.equal(readSupplierBalances({Balances:{Total:{USD:'1002.8'}}}).accountBalance.amount,'1002.80');
  assert.equal(supplierMoney('usd','00010.230000').amount,'10.23');
});
test('stock acquisition currency is independent of face-value currency',()=>{
  assert.deepEqual(readSupplierPrice({cardcurrency:'TRY',cardvalue:'250',currency:'USD',price:'6.95'}),{currency:'USD',amount:'6.95'});
  assert.throws(()=>readSupplierPrice({cardcurrency:'USD',price:'10'}),/currency/);
  assert.throws(()=>readSupplierPrice({currency:'USD',price:'-1'}),/Negative/);
});
test('malformed, ambiguous and missing values are not silently treated as money',()=>{
  for(const amount of ['',null,false,0,[],{},'NaN','Infinity','1,00','1e3','1.123456789']){
    assert.throws(()=>supplierMoney('USD',amount));
  }
  assert.throws(()=>readSupplierBalances({}));
  assert.throws(()=>readSupplierBalances({Balances:{Balance:{USD:'1',usd:'2'}}}));
  assert.throws(()=>readSupplierBalances({Balances:{'Available Balance':{USD:'1',GBP:'1'}}}));
  assert.throws(()=>assessSupplierFunds(readSupplierBalances(liveShape),supplierMoney('USD','0')));
});
