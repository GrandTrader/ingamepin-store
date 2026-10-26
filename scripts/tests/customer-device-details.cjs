const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),test=require('node:test'),crypto=require('node:crypto');
function load(file,overrides={}){const exports={};const code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const req=n=>Object.hasOwn(overrides,n)?overrides[n]:n==='server-only'?{}:require(n);vm.runInThisContext('(function(exports,require){'+code+'\n})',{filename:path.resolve(file)})(exports,req);return exports;}
const details=load('lib/customer-device-details.ts');
const android='Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Mobile Safari/537.36';
const iphone='Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const windows='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36';
test('device clues handle reduced Android, iPhone, desktop and missing or hostile hints honestly',()=>{
 let d=details.customerDeviceDetails(new Headers({'user-agent':android}));assert.equal(d.model,null);assert.equal(d.os,'Android');assert.equal(d.device_type,'mobile');
 d=details.customerDeviceDetails(new Headers({'user-agent':android,'sec-ch-ua-model':'"SM-S918B"','sec-ch-ua-platform':'"Android"'}));assert.equal(d.model,'SM-S918B');assert.equal(d.brand,'Samsung');assert.equal(d.model_source,'client-hint');
 d=details.customerDeviceDetails(new Headers({'user-agent':iphone}));assert.equal(d.model,null);assert.equal(d.brand,'Apple');assert.equal(d.os,'iOS');
 d=details.customerDeviceDetails(new Headers({'user-agent':windows}));assert.equal(d.device_type,'Computer (desktop/laptop)');assert.equal(d.model,null);assert.equal(d.brand,null);assert.equal(d.os,'Windows');
 d=details.customerDeviceDetails(new Headers({'user-agent':'node'}));assert.equal(d.model,null);assert.equal(d.device_type,null);assert.equal(d.browser,null);
 d=details.customerDeviceDetails(new Headers({'user-agent':android,'sec-ch-ua-model':'"'+('x'.repeat(500))+'"'}));assert.equal(d.model,null);
 d=details.customerDeviceDetails(new Headers({'sec-ch-ua-model':'"Pixel 9"','sec-ch-ua-platform':'"Android"','sec-ch-ua-mobile':'?1'}));assert.equal(d.brand,'Google');assert.equal(d.model,'Pixel 9');
 assert.equal(details.normalizeCustomerDeviceDetails({model:'x'.repeat(500),unexpected:'secret'}).model.length,100);
 assert(!JSON.stringify(details.normalizeCustomerDeviceDetails({unexpected:'secret'})).includes('secret'));
});
test('signed browser cookie persists, rotates tampered and expired IDs, and fails without blocking authentication',async()=>{
 const old=process.env.NODE_ENV;process.env.NODE_ENV='production';let stored='',writes=0,opts,name,fail=false;
 const sign=v=>crypto.createHmac('sha256','unit-test-secret').update(v).digest('hex');
 const cookie=load('lib/customer-browser-id.ts',{'next/headers':{cookies:async()=>{if(fail)throw Error('unavailable');return {get:()=>stored?{value:stored}:undefined,set:(n,v,o)=>{name=n;stored=v;opts=o;writes++;}}}},'@/lib/request-security':{securityHash:sign}});
 try{
 const first=await cookie.customerBrowserId();assert.match(first,/^[0-9a-f-]{36}$/);assert.equal(await cookie.customerBrowserId(),first);assert.equal(writes,1);assert.equal(name,'__Host-igp-browser');assert.equal(opts.httpOnly,true);assert.equal(opts.secure,true);assert.equal(opts.path,'/');assert.equal(opts.sameSite,'lax');assert(!opts.domain);
 stored=stored.slice(0,-1)+(stored.endsWith('0')?'1':'0');assert.notEqual(await cookie.customerBrowserId(),first);
 const issued=String(Math.floor(Date.now()/1000)-181*86400);stored=`${first}.${issued}.${sign(`customer-browser:v1:${first}:${issued}`)}`;assert.notEqual(await cookie.customerBrowserId(),first);
 stored='invalid.'+'x'.repeat(500);assert(await cookie.customerBrowserId());
 fail=true;assert.equal(await cookie.customerBrowserId(),null);
 }finally{if(old===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=old;}
});
