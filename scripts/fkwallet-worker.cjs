// Continuous scheduler for a local preview or an always-on Node.js server.
// The website owns payment validation and durable submission/delivery state.
require('@next/env').loadEnvConfig(process.cwd());
const {setTimeout:delay}=require('node:timers/promises');
let stopped=false;process.on('SIGINT',()=>{stopped=true});process.on('SIGTERM',()=>{stopped=true});
(async()=>{
 const origin=new URL(process.env.FKWALLET_WORKER_URL||'http://localhost:3000');
 if(origin.protocol!=='https:' && !(origin.protocol==='http:'&&['localhost','127.0.0.1'].includes(origin.hostname)))throw Error('Use HTTPS for a remote delivery worker.');
 const secret=process.env.CRON_SECRET?.trim();if(!secret||secret.length<24)throw Error('Set a strong CRON_SECRET in the website and worker environments.');
 while(!stopped){
  try{
   const response=await fetch(new URL('/api/cron/fkwallet',origin),{headers:{Authorization:'Bearer '+secret},redirect:'error',signal:AbortSignal.timeout(190000)});
   // Never print the request URL, auth header, provider body, customer fields or codes.
   console.log(new Date().toISOString(),response.ok?'FKWallet delivery check completed.':'FKWallet delivery check failed; review website setup.');
   await response.body?.cancel();
  }catch{console.log(new Date().toISOString(),'FKWallet worker could not reach the website; purchase requests are not retried.');}
  if(!stopped)await delay(15000);
 }
})().catch(error=>{console.error(error.message);process.exitCode=1});
