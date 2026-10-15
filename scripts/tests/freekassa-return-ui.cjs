const fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),assert=require('node:assert/strict'),http=require('node:http');
const {NextRequest,NextResponse}=require('next/server');
const {chromium}=require('C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
function load(file,deps){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>n==='server-only'?{}:deps[n]??require(n),URL,Buffer,process:{env:{NODE_ENV:'production'}}});return exports;}
const helpers=load('lib/freekassa-return.ts',{'next/server':{NextResponse}});
const token='a'.repeat(64);
let privateReads=0;
const database={from(){const filters={};return{
select(){return this},eq(k,v){filters[k]=v;return this},
async maybeSingle(){privateReads++;return{data:filters.invoice_id==='123'&&filters.public_token===token?{return_url:'https://digiseller.me/resultpage?puid=FIXTURE_ONLY'}:null}}
}}};
const route=load('app/api/freekassa/success/route.ts',{'next/server':{NextResponse},'@/lib/freekassa-return':helpers,'@/lib/supabase/admin':{createAdminClient:()=>database}});
(async()=>{
let method='GET',confirmed=false,port;
const server=http.createServer(async(req,res)=>{try{
const host=req.headers.host,url=new URL(req.url,'http://'+host);
let response;
if(url.pathname==='/begin')response=helpers.freeKassaCheckoutRedirect('http://127.0.0.1:'+port+'/pay','123',token);
else if(url.pathname==='/pay'){res.setHeader('Content-Type','text/html');return res.end('<form action="http://localhost:'+port+'/api/freekassa/success" method="'+method+'"><input name="o" value="DS-123"><button>Return to purchase</button></form>');}
else if(url.pathname==='/api/freekassa/success'){let body='';for await(const chunk of req)body+=chunk;const request=new NextRequest(url,{method:req.method,headers:req.headers,...(req.method==='POST'?{body}:{} )});response=await route[req.method](request);}
else{res.statusCode=404;return res.end();}
const location=response.headers.get('location');
if(location?.startsWith('https://digiseller.me/resultpage?')){confirmed=true;res.setHeader('Content-Type','text/html');return res.end('<h1>Fixture purchase</h1>');}
if(location==='https://oplata.info/'){res.statusCode=403;return res.end('Private link blocked');}
res.writeHead(response.status,Object.fromEntries(response.headers));res.end();
}catch(e){res.statusCode=500;res.end(String(e));}});
await new Promise(resolve=>server.listen(0,resolve));port=server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});
try{for(method of ['GET','POST']){confirmed=false;const context=await browser.newContext(),page=await context.newPage();
await page.goto('http://localhost:'+port+'/begin');await page.getByRole('button',{name:'Return to purchase'}).click();await page.getByRole('heading',{name:'Fixture purchase'}).waitFor();assert(confirmed);assert.equal(privateReads,method==='GET'?1:2);
console.log('PASS browser '+method+': private cookie survives cross-site return and authorizes the correct purchase link. No external page opened.');await context.close();}
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});
