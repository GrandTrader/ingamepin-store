const test=require('node:test'),assert=require('node:assert/strict');
const braces=require('braces');
test('braces rejects deep brace/parenthesis patterns with a controlled error',()=>{
 for(const method of ['parse','compile','expand','stringify'])for(const [open,close] of [['{','}'],['(',')'],['{(',')}']])for(const balanced of [true,false]){
  const pattern=open.repeat(2000)+'a,b'+(balanced?close.repeat(2000):'');
  assert.throws(()=>braces[method](pattern),e=>e.name==='SyntaxError'&&/safe nesting/.test(e.message));
 }
});
test('AST entry points reject excessive depth and child cycles',()=>{
 for(const method of ['compile','expand','stringify']){
  let ast={type:'text',value:'a'};for(let i=0;i<5000;i++)ast={type:'root',nodes:[ast]};
  assert.throws(()=>braces[method](ast),/safe nesting/);
  const cycle={type:'root',nodes:[]};cycle.nodes.push(cycle);assert.throws(()=>braces[method](cycle),/safe nesting/);
 }
});
test('normal build/lint patterns retain expansion and matching behavior',()=>{
 assert.deepEqual(braces.expand('src/{app,lib}/**/*.{ts,tsx}'),['src/app/**/*.ts','src/app/**/*.tsx','src/lib/**/*.ts','src/lib/**/*.tsx']);
 assert.deepEqual(braces.expand('file-{1..3}.txt'),['file-1.txt','file-2.txt','file-3.txt']);
 const match=require('micromatch');assert.deepEqual(match(['app/a.ts','lib/a.tsx','image.png'],'{app,lib}/**/*.{ts,tsx}'),['app/a.ts','lib/a.tsx']);
});
