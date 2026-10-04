const fs=require('fs'),vm=require('vm'),assert=require('node:assert/strict'),ts=require('typescript');
const {NextRequest,NextResponse}=require('next/server');
function load(file,mocks={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>name in mocks?mocks[name]:require(name),URL,URLSearchParams,process,console});return exports;}
const policy=load('lib/affiliate-link-expiry.ts');
assert.equal(policy.isExpiredAffiliateLink('/product/definiteplay-private',new URLSearchParams('ref=IGP-TEST')),true);
assert.equal(policy.isExpiredAffiliateLink('/product/another-product/',new URLSearchParams('ref=&ref=IGP-TEST')),true);
for(const [path,query] of [['/category/minecraft/584976958/subcategory/874868382','ref=IGP-TEST'],['/product/normal-product',''],['/product/normal-product','ref='],['/account/affiliate','ref=IGP-TEST']])assert.equal(policy.isExpiredAffiliateLink(path,new URLSearchParams(query)),false);
let authCalls=0,dbCalls=0;
const proxy=load('proxy.ts',{'@/lib/affiliate-link-expiry':policy,'@/lib/password-expiry':{},'@/lib/admin-assurance':{},'@supabase/ssr':{createServerClient:()=>{authCalls++;throw Error('Should not reach auth')}},'next/server':{NextRequest,NextResponse}});
const visit=load('app/api/affiliate/visit/route.ts',{'@/lib/supabase/admin':{createAdminClient:()=>{dbCalls++;throw Error('Should not access DB')}},'next/server':{NextRequest,NextResponse}});
(async()=>{
const response=await proxy.proxy(new NextRequest('https://www.ingamepin.com/product/definiteplay-private?ref=IGP-TEST'));
assert.equal(response.status,307);assert.equal(response.headers.get('location'),'https://www.ingamepin.com/affiliate-link-expired');assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(authCalls,0);
assert.equal(response.cookies.get('igp_affiliate_click').value,'');assert.equal(response.cookies.get('igp_affiliate_code').value,'');
const tracked=await visit.POST(new NextRequest('https://www.ingamepin.com/api/affiliate/visit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({affiliateCode:'IGP-TEST',productId:'test',landingPath:'/product/definiteplay-private?ref=IGP-TEST'})}));
assert.equal(tracked.status,410);assert.equal((await tracked.json()).tracked,false);assert.equal(dbCalls,0);
console.log('PASS: legacy referral links expire, clean and non-referral URLs remain allowed, referral cookies cleared, expired visits rejected before database access.');
})().catch(e=>{console.error(e);process.exitCode=1});
