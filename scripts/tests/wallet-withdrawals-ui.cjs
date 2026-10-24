// Real components, isolated mock actions. No customer balances or crypto are used.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
const out=path.join(process.cwd(),'tmp/wallet-withdrawals-ui');fs.mkdirSync(out,{recursive:true});
function compile(file){return ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;}
const write=(file,text)=>fs.writeFileSync(path.join(out,file),text);
write('Form.js',compile('app/account/wallet/WithdrawalForm.tsx'));write('helper.js',compile('lib/wallet-withdrawals.ts'));
write('Return.js',"module.exports=()=>require('react').createElement('input',{type:'hidden',name:'return_to',value:'/account/wallet'});");
write('withdrawal-actions.js',"exports.requestWithdrawal=async form=>{window.calls.push(Object.fromEntries(form));await new Promise(r=>setTimeout(r,400));};");
write('entry.js',"const React=require('react'),{createRoot}=require('react-dom/client'),Form=require('./Form').default;window.calls=[];createRoot(document.getElementById('app')).render(React.createElement('main',{className:'mx-auto max-w-2xl p-4'},React.createElement('section',{className:'rounded-xl border border-slate-200 bg-white p-4'},React.createElement('h1',{className:'text-xl font-bold'},'Request crypto withdrawal'),React.createElement(Form,{balance:250,requestKey:'00000000-0000-4000-8000-000000000010'}))));");
function load(file,imports={}){const mod={exports:{}};new Function('exports','require','module',compile(file))(mod.exports,n=>n in imports?(imports[n].default?{__esModule:true,...imports[n]}:imports[n]):require(n),mod);return mod.exports;}
const helper=load('lib/wallet-withdrawals.ts'),receipt=load('lib/wallet-receipt.ts');
const History=load('components/WithdrawalHistory.tsx',{'@/lib/wallet-withdrawals':helper,'@/lib/wallet-receipt':receipt}).default;
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
const rows=['REQUESTED','APPROVED','PAID'].map((status,i)=>({id:id(10+i),user_id:id(3),amount:100,network:'TRC20',network_fee:4.5,net_usdt:95.5,wallet_address:'T'+'A'.repeat(33),status,transaction_id:status==='PAID'?'a'.repeat(64):null,reason:null,reviewed_by:status==='APPROVED'?id(1):null,reviewed_at:null,completed_at:null,created_at:'2026-10-25T01:00:00Z'}));
const session={auth:{getUser:async()=>({data:{user:{id:id(1)}}})},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:{user_id:id(1)}})})};
const admin={auth:{admin:{getUserById:async()=>({data:{user:{email:'customer@example.com'}}})}},from(table){const q={select(){return q;},eq(){return q;},in(){return q;},order(){return q;},range(){return q;},limit(){return q;},then(resolve){return Promise.resolve({data:table==='wallet_withdrawal_requests'?rows:[],count:rows.length,error:null}).then(resolve);}};return q;}};
const Admin=load('app/admin/wallet/withdrawals/page.tsx',{'next/link':{default:({children,prefetch,...props})=>React.createElement('a',props,children)},'next/navigation':{redirect:p=>{throw Error(p)}},'@/lib/supabase/admin-session':{createClient:async()=>session},'@/lib/supabase/admin':{createAdminClient:()=>admin},'@/lib/wallet-receipt':receipt,'@/lib/wallet-withdrawals':helper,'@/components/WithdrawalHistory':{default:History},'../../AdminSidebar':{default:()=>null},'./actions':{reviewWithdrawal:async()=>{}}}).default;
(async()=>{
 await new Promise((resolve,reject)=>require('next/dist/compiled/webpack/webpack').webpack({mode:'development',devtool:false,entry:path.join(out,'entry.js'),resolve:{alias:{'@/lib/wallet-withdrawals':path.join(out,'helper.js'),'@/components/AccountReturnField':path.join(out,'Return.js')}},output:{path:out,filename:'bundle.js'}},(err,stats)=>err||stats.hasErrors()?reject(err||Error(stats.toString({all:false,errors:true}))):resolve()));
 const css=fs.readdirSync('.next/static',{recursive:true}).filter(p=>p.endsWith('.css')).map(p=>fs.readFileSync(path.join('.next/static',p),'utf8')).join('\n');
 const shell=body=>'<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'body{margin:0;font-family:Arial;background:#f1f5f9}</style></head><body>'+body+'</body></html>';
 const customerHtml=shell('<div id="app"></div><script src="/bundle.js"></script>');
 const adminHtml=shell(renderToStaticMarkup(await Admin({searchParams:Promise.resolve({status:'ALL'})})));
 const server=http.createServer((req,res)=>{res.setHeader('Content-Type',req.url==='/bundle.js'?'text/javascript':'text/html');res.end(req.url==='/bundle.js'?fs.readFileSync(path.join(out,'bundle.js')):req.url==='/admin-test'?adminHtml:customerHtml);});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const {chromium}=require(process.env.PLAYWRIGHT_PATH||'C:/Users/amans/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
 const browser=await chromium.launch({channel:'chrome',headless:true});
 try {
  for(const width of [1440,390]){
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   const base='http://127.0.0.1:'+server.address().port;await page.goto(base);
   await page.getByLabel('Amount from wallet (USD)').fill('100');
   await page.getByLabel('Receiving USDT wallet address').fill('T'+'A'.repeat(33));
   await page.getByText('95.50 USDT',{exact:true}).waitFor();
   const confirm=page.getByRole('checkbox');await confirm.check();
   await page.getByLabel('USDT network').selectOption('BEP20');
   assert.equal(await confirm.isChecked(),false,'Changing fee/network resets consent');
   await page.getByText('99.50 USDT',{exact:true}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Confirm withdrawal request'}).isDisabled(),true);
   await page.getByLabel('Receiving USDT wallet address').fill('0x'+'a'.repeat(40));
   await confirm.check();
   await page.getByLabel('Amount from wallet (USD)').fill('251');
   await confirm.check();assert.equal(await page.getByRole('button',{name:'Confirm withdrawal request'}).isDisabled(),true);
   await page.getByLabel('Amount from wallet (USD)').fill('100.001');
   await confirm.check();assert.equal(await page.getByRole('button',{name:'Confirm withdrawal request'}).isDisabled(),true);
   await page.getByLabel('Amount from wallet (USD)').fill('100');
   await confirm.check();assert.equal(await page.getByRole('button',{name:'Confirm withdrawal request'}).isDisabled(),false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Customer form fits viewport');
   await page.screenshot({path:path.join(out,'customer-'+width+'.png'),fullPage:true});
   await page.getByRole('button',{name:'Confirm withdrawal request'}).click();
   await page.getByRole('button',{name:'Submitting request…'}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Submitting request…'}).isDisabled(),true);
   await page.getByRole('button',{name:'Confirm withdrawal request'}).waitFor();
   assert.equal(await page.evaluate(()=>window.calls.length),1);
   await page.goto(base+'/admin-test');
   await page.getByRole('button',{name:'Approve & assign to me'}).waitFor();
   assert.equal(await page.getByRole('button',{name:'Record completed payout'}).count(),1);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Admin cards fit viewport');
   await page.screenshot({path:path.join(out,'admin-'+width+'.png'),fullPage:true});
   assert.deepEqual(errors,[]);await page.close();
  }
  console.log('Withdrawal desktop/mobile browser checks passed: fee previews, consent reset, validation, submission and no overflow.');
 } finally {await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1});
