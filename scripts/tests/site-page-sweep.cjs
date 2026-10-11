// Read-only sweep. Fetches HTML, so it does not run product-view tracking or submit purchases.
const fs=require('node:fs');
const base=process.env.STOREFRONT_TEST_URL||'http://127.0.0.1:3133';
const extra=['/track-order','/cart','/checkout','/preorder','/products/gift-cards','/products/game-keys','/products/subscriptions','/products/gaming-top-ups','/products?search=resident%20evil','/account','/account/register','/account/forgot-password','/business/login','/shree-bangla-panchang/privacy'];
(async()=>{
 const sitemap=await(await fetch(base+'/sitemap.xml')).text();
 const paths=[...new Set([...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m=>new URL(m[1]).pathname).concat(extra))];
 const results=[];let next=0;
 async function inspect(path){const start=Date.now();let usefulMs=null,status,finalPath;try{
  const response=await fetch(base+path,{signal:AbortSignal.timeout(30000)});status=response.status;finalPath=new URL(response.url).pathname;
  const reader=response.body.getReader(),decoder=new TextDecoder();let html='';
  const isProduct=path.includes('/subcategory/')||path.startsWith('/product/');
  for(;;){const {value,done}=await reader.read();if(done)break;html+=decoder.decode(value,{stream:true});if(usefulMs===null&&(isProduct?/<button\b[^>]*>[^<]*Buy Now<\/button>/.test(html):/<h[12][\s>]/.test(html)))usefulMs=Date.now()-start;}
  const failed=status>=400||(/\/subcategory\//.test(path)&&(!usefulMs||/NEXT_HTTP_ERROR_FALLBACK;404/.test(html)));
  results.push({path,status,finalPath,usefulMs,totalMs:Date.now()-start,bytes:Buffer.byteLength(html),failed});
 }catch(e){results.push({path,status,failed:true,error:e.message,totalMs:Date.now()-start});}
 if(results.length%25===0)console.log(`${results.length}/${paths.length} pages checked; ${results.filter(r=>r.failed).length} failures.`);
 }
 await Promise.all([0,1].map(async()=>{while(next<paths.length){const i=next++;await inspect(paths[i]);}}));
 // These are access-control checks, not a signed-in performance measurement.
 if(process.env.STOREFRONT_REPORT)fs.writeFileSync(process.env.STOREFRONT_REPORT,JSON.stringify({base,pages:results.length,results},null,2));
 const guardPaths=['/account/dashboard','/account/wallet','/account/profile','/account/orders','/account/portal/new','/admin/products','/admin/orders'];
 const guards=[];for(const path of guardPaths){const r=await fetch(base+path,{redirect:'manual',signal:AbortSignal.timeout(15000)});const text=await r.text();const destination=r.headers.get('location');const redirected=Boolean(destination)||text.includes('NEXT_REDIRECT');guards.push({path,status:r.status,destination,redirected});}
 const times=results.map(r=>r.usefulMs).filter(Number.isFinite).sort((a,b)=>a-b);
 const summary={pages:results.length,failures:results.filter(r=>r.failed),medianUsefulMs:times[Math.floor(times.length/2)],p95UsefulMs:times[Math.floor(times.length*.95)],guards};
 if(process.env.STOREFRONT_REPORT)fs.writeFileSync(process.env.STOREFRONT_REPORT,JSON.stringify({base,...summary,results},null,2));
 console.log(JSON.stringify(summary,null,2));if(summary.failures.length||guards.some(g=>!g.redirected))process.exitCode=1;
})().catch(e=>{console.error(e);process.exitCode=1;});
