const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
const mod={exports:{}};
new Function('exports','require','module',ts.transpileModule(fs.readFileSync('lib/face-value.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod.exports,require,mod);
const {faceDenomination,faceValueTotals,formatFaceValue,quoteFaceItem}=mod.exports;
test('All six purchased denominations total USD 2175, independent of selling prices',()=>{
 const items=[[2,100],[3,100],[10,60],[30,15],[20,20],[5,45]].map(([denomination,quantity])=>({denomination,quantity,denominationCurrency:'USD',unitPrice:999}));
 assert.equal(formatFaceValue(items),'USD 2,175.00');
 assert.equal(formatFaceValue([items[0]]),'USD 200.00');
});
test('Mixed currencies stay separate and decimal quantities of cards are rejected',()=>{
 const result=faceValueTotals([{denomination:'0.10',quantity:3,denominationCurrency:'USD'},{denomination:100,quantity:2,denominationCurrency:'INR'},{denomination:.2,quantity:1,denominationCurrency:'USD'}]);
 assert.deepEqual(result,{totals:[{currency:'INR',amount:200},{currency:'USD',amount:.5}],unspecified:0});
 for(const quantity of [-1,0,1.5,Infinity])assert.equal(formatFaceValue([{denomination:10,quantity,denominationCurrency:'USD'}]),'Not specified');
});
test('Range order snapshot overrides changed option denomination/currency',()=>{
 const item={option_name:'Range - 250.00 INR',denomination:1,custom_value:250,quantity:200,product_options:{denomination_currency:'USD'}};
 assert.equal(formatFaceValue([item]),'INR 50,000.00');
 assert.equal(formatFaceValue([{denomination:50,quantity:2,product_options:[{denomination_currency:'USD'}]}]),'USD 100.00');
});
test('Unknown face values are never substituted with selling price or payment currency',()=>{
 for(const item of [{denomination:null,quantity:1,denominationCurrency:'USD'},{denomination:10,quantity:1,currency:'USD',unitPrice:9},{denomination:'Standard',quantity:1,denominationCurrency:'USD'}])assert.equal(faceDenomination(item),null);
 assert.match(formatFaceValue([{denomination:10,quantity:1,denominationCurrency:'USD'},{quantity:1}]),/some items not specified/);
});
test('Quote rows match denomination by product and option, never position',()=>{
 const draft=[{productName:'Apple',editionName:'10 USD',denomination:10,denominationCurrency:'USD',quantity:2},{productName:'Apple',editionName:'50 USD',denomination:50,denominationCurrency:'USD',quantity:3}];
 const quote={productName:'Apple',optionName:'50 USD',quantity:3};
 assert.equal(formatFaceValue([quoteFaceItem(quote,draft)]),'USD 150.00');
 assert.equal(formatFaceValue([quoteFaceItem(quote,[...draft,{...draft[1],denominationCurrency:'INR'}])]),'Not specified');
 assert.equal(formatFaceValue([quoteFaceItem({productName:'Apple',optionName:'Range - 2.00 USD',quantity:100},[])]),'USD 200.00');
});
