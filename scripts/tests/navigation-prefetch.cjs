const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
const moduleOutput = {exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/navigation-prefetch.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{module:moduleOutput,exports:moduleOutput.exports,URL});
const {canPrefetchPage} = moduleOutput.exports;
const origin = 'https://www.ingamepin.com';
test('preload only same-origin public catalog routes',()=>{
  for(const href of ['/product/steam','/category/apple','/category/apple/123/subcategory/456','/products','/products/gift-cards']) assert(canPrefetchPage(href,origin),href);
});
test('never speculate on authenticated, payment, external, or token-bearing links',()=>{
  for(const href of ['/admin/products','/account/wallet','/checkout/usdt','/api/usdt/status','https://evil.test/product/steam','//evil.test/products','javascript:alert(1)','/products?token=secret','/products#section','/seller','/support']) assert(!canPrefetchPage(href,origin),href);
});
