const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function harness({pathname='/category/test',saveData=false,effectiveType='4g',visibility='visible'}={}){
 let time=0,id=0,cleanup;const timers=new Map(),listeners=new Map(),calls=[],anchors=[],mutations=[];
 class Element {closest(){return this;}getAttribute(){return null;}}
 class Anchor extends Element {constructor(href,opts={}){super();this.href=new URL(href,'https://www.ingamepin.com').href;this.target='';this.dataset={};this.isConnected=true;this.content=true;Object.assign(this,opts);}hasAttribute(k){return k==='download'&&!!this.download;}getBoundingClientRect(){return {width:100,height:40,top:this.hidden?2000:100,bottom:this.hidden?2040:140,left:0,right:100};}}
 class KeyboardEvent {}
 const doc={visibilityState:visibility,body:{},querySelectorAll:s=>anchors.filter(a=>s==='a[href]'||a.content),addEventListener:(n,f)=>listeners.set(n,f),removeEventListener:n=>listeners.delete(n),getElementById:id=>anchors.find(a=>a.id===id)};
 const context={URL,Map,Set,WeakSet,Date:{now:()=>time},Element,HTMLAnchorElement:Anchor,KeyboardEvent,document:doc,navigator:{connection:{saveData,effectiveType}},location:{origin:'https://www.ingamepin.com'},innerWidth:1400,innerHeight:900,setTimeout:(fn,delay)=>{timers.set(++id,{fn,at:time+delay});return id;},clearTimeout:id=>timers.delete(id),IntersectionObserver:class{observe(){}disconnect(){}},MutationObserver:class{constructor(fn){mutations.push(fn);}observe(){}disconnect(){}}};
 const helper={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync('lib/navigation-prefetch.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{...context,module:helper,exports:helper.exports});
 const module={exports:{}};const mocks={'react':{useRef:value=>({current:value}),useEffect:fn=>{cleanup=fn();}},'next/navigation':{usePathname:()=>pathname,useRouter:()=>({prefetch:(href,options)=>calls.push({href,...options})})},'next/dist/client/components/router-reducer/router-reducer-types':{PrefetchKind:{FULL:'full'}},'@/lib/navigation-prefetch':helper.exports};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('components/NavigationWarmup.tsx','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText,{...context,module,exports:module.exports,require:n=>{assert(n in mocks,n);return mocks[n];}});
 function tick(ms){const end=time+ms;for(;;){const next=[...timers].filter(([,v])=>v.at<=end).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;const [key,value]=next;time=value.at;timers.delete(key);value.fn();}time=end;}
 return {calls,anchors,doc,tick,add:(href,opts)=>{const a=new Anchor(href,opts);anchors.push(a);return a;},start:()=>module.exports.default(),event:(type,target)=>listeners.get(type)?.({type,target}),mutate:()=>mutations.forEach(fn=>fn()),stop:()=>cleanup?.()};
}
test('visible storefront links prepare full pages, prioritize content and respect the six-page budget',()=>{
 const h=harness();h.add('/category/header',{content:false});for(let i=0;i<10;i++)h.add('/product/'+i);h.add('/product/0');h.start();h.tick(5000);assert.deepEqual(h.calls.map(c=>c.href),Array.from({length:6},(_,i)=>'/product/'+i));assert(h.calls.every(c=>c.kind==='full'));h.tick(10000);assert.equal(h.calls.length,6);
});
test('intent still prepares a product after the viewport budget; duplicate and stale requests are handled',()=>{
 const h=harness();for(let i=0;i<8;i++)h.add('/product/'+i);h.start();h.tick(5000);const a=h.anchors[7];h.event('pointerover',a);h.tick(64);assert.equal(h.calls.length,6);h.tick(1);assert.equal(h.calls.at(-1).href,'/product/7');h.event('focusin',a);assert.equal(h.calls.length,7);h.calls.at(-1).onInvalidate();h.event('touchstart',a);assert.equal(h.calls.length,8);h.tick(31000);h.event('focusin',a);assert.equal(h.calls.length,9);
});
test('data saver, slow networks, hidden tabs and protected areas do not trigger full-page background reads',()=>{
 for(const options of [{saveData:true},{effectiveType:'2g'},{effectiveType:'slow-2g'},{visibility:'hidden'},{pathname:'/account/dashboard'},{pathname:'/checkout/paypal'},{pathname:'/admin/products'},{pathname:'/business/login'}]){const h=harness(options);const a=h.add('/product/allowed');h.start();h.tick(5000);h.event('focusin',a);assert.equal(h.calls.length,0,JSON.stringify(options));}
});
test('private, external, download, opted-out, query-bearing and offscreen links are excluded from automatic preparation',()=>{
 const h=harness();for(const href of ['/account/wallet','/checkout','/api/orders','https://example.com/product/a','/product/a?ref=code','/category/test'])h.add(href);h.add('/product/download',{download:true});h.add('/product/new-tab',{target:'_blank'});h.add('/product/off',{dataset:{storePrefetch:'off'}});h.add('/product/lower',{hidden:true});h.start();h.tick(5000);assert.equal(h.calls.length,0);h.event('focusin',h.anchors.at(-1));assert.equal(h.calls.at(-1).href,'/product/lower');
});
test('products arriving after streaming are prepared, and pending work stops when leaving a page',()=>{
 const h=harness();h.start();h.tick(1000);h.add('/product/streamed');h.mutate();h.tick(500);assert.equal(h.calls.at(-1).href,'/product/streamed');const a=h.add('/product/later');h.event('pointerover',a);h.stop();h.tick(5000);assert.equal(h.calls.length,1);
});

test('a header arriving before streamed content cannot consume the product preload budget',()=>{
 const h=harness();for(let i=0;i<10;i++)h.add('/category/header-'+i,{content:false});h.start();h.tick(5000);assert.equal(h.calls.length,0);const product=h.add('/product/first');h.mutate();h.tick(1000);assert.equal(h.calls.at(-1).href,'/product/first');h.event('focusin',h.anchors[0]);assert.equal(h.calls.at(-1).href,'/category/header-0');
});
