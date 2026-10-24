const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server');
function load(file,imports={}) {
 const mod={exports:{}},code=ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText;
 new Function('exports','require','module',code)(mod.exports,name=>name in imports?imports[name]:require(name),mod);return mod.exports;
}
const helper=load('lib/wallet-withdrawals.ts'),receipt=load('lib/wallet-receipt.ts');
const customer='00000000-0000-4000-8000-000000000003',key='00000000-0000-4000-8000-000000000010';
test('fixed fees and exact cent subtraction; malformed or tiny amounts fail',()=>{
 for(const [net,fee,total] of [['TRC20',4.5,95.5],['BEP20',.5,99.5],['SOLANA',2.5,97.5]]){
  const q=helper.withdrawalQuote('100',net);assert.equal(q.valid,true);assert.equal(q.fee,fee);assert.equal(q.net,total);
 }
 for(const amount of ['', '-10','NaN','Infinity','1e2','100.001','0','4.50'])assert.equal(helper.withdrawalQuote(amount,'TRC20').valid,false,amount);
 assert.equal(helper.withdrawalQuote('100','OTHER').valid,false);
 assert.equal(helper.withdrawalQuote('4.51','TRC20').net,.01);
 assert.equal(helper.validWithdrawalAddress('BEP20','0x'+'a'.repeat(40)),true);
 assert.equal(helper.validWithdrawalAddress('TRC20','0x'+'a'.repeat(40)),false);
});
function actions(options={}){
 const calls=[],revalidations=[];
 const session={auth:{getUser:async()=>({data:{user:options.loggedOut?null:{id:customer,email_confirmed_at:options.unverified?null:'2026-01-01'}}})},rpc:async(name,args)=>{calls.push({name,args});return {data:key,error:options.error?{message:'Unavailable'}:null};},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:options.denied?null:{user_id:customer}})})};
 const common={'next/navigation':{redirect:path=>{throw new Error('REDIRECT '+path);}},'next/cache':{revalidatePath:path=>revalidations.push(path)},'@/lib/supabase/server':{createClient:async()=>session},'@/lib/supabase/admin-session':{createClient:async()=>session},'@/lib/supabase/admin':{createAdminClient:()=>session},'@/lib/wallet-withdrawals':helper,'@/lib/wallet-receipt':receipt};
 return {...load('app/account/wallet/withdrawal-actions.ts',common),...load('app/admin/wallet/withdrawals/actions.ts',common),calls,revalidations};
}
function form(extra={}){const data=new FormData();for(const [k,v] of Object.entries({amount:'100',network:'TRC20',wallet_address:'T'+'A'.repeat(33),confirmed:'yes',request_key:key,...extra}))data.set(k,v);return data;}
test('customer mutations require verified sign-in and never accept caller-supplied owner or fees',async()=>{
 for(const options of [{loggedOut:true},{unverified:true}]){const a=actions(options);await assert.rejects(a.requestWithdrawal(form()),/REDIRECT.*verified/);assert.equal(a.calls.length,0);}
 const a=actions();await assert.rejects(a.requestWithdrawal(form({customer_id:'attacker',network_fee:'0',return_to:'https://evil.example'})),/REDIRECT \/account\/wallet\?success=/);
 assert.deepEqual(a.calls[0],{name:'request_wallet_withdrawal',args:{p_request_key:key,p_amount:100,p_network:'TRC20',p_wallet_address:'T'+'A'.repeat(33)}});
 assert.ok(a.revalidations.includes('/account/portal/wallet'));
});
test('customer validation and consent prevent invalid requests, portal returns stay local',async()=>{
 for(const invalid of [{confirmed:''},{amount:'100.005'},{network:'OTHER'},{wallet_address:'invalid'},{request_key:'invalid'}]){const a=actions();await assert.rejects(a.requestWithdrawal(form(invalid)),/REDIRECT.*error=/);assert.equal(a.calls.length,0);}
 const a=actions();await assert.rejects(a.cancelWithdrawal(form({request_id:key,return_to:'/account/portal/wallet'})),/REDIRECT \/account\/portal\/wallet\?success=/);assert.deepEqual(a.calls[0].args,{p_request_id:key});
});
test('admin mutations require admin access and explicit action confirmation',async()=>{
 const denied=actions({denied:true});await assert.rejects(denied.setWithdrawalAccess(form({customer_id:customer,enabled:'true'})),/Access denied/);assert.equal(denied.calls.length,0);
 const a=actions();await assert.rejects(a.reviewWithdrawal(form({request_id:key,action:'PAY',confirmed:''})),/error=/);assert.equal(a.calls.length,0);
 await assert.rejects(a.setWithdrawalAccess(form({customer_id:customer,enabled:'true'})),/success=/);assert.equal(a.calls[0].args.p_admin_user_id,customer);
 await assert.rejects(a.reviewWithdrawal(form({request_id:key,action:'PAY',note:'abc'})),/success=/);assert.equal(a.calls[1].args.p_admin_user_id,customer);
});
test('customer section defaults hidden; holds remain visible after access is disabled',async()=>{
 async function render(enabled,rows=[],error=null){
  const session={from(table){const q={select(){return q;},eq(){return q;},in(){q.active=true;return q;},not(){q.history=true;return q;},order(){return q;},limit(){return q;},maybeSingle:async()=>({data:{enabled},error}),then(resolve){return Promise.resolve({data:q.active?rows:[],error}).then(resolve);}};return q;}};
  const Section=load('app/account/wallet/WithdrawalSection.tsx',{'@/lib/supabase/server':{createClient:async()=>session},'@/lib/wallet-withdrawals':helper,'@/components/AccountReturnField':{default:()=>null},'@/components/WithdrawalHistory':{default:()=>React.createElement('p',{},'History')},'./WithdrawalForm':{default:()=>React.createElement('div',{},'Form')},'./withdrawal-actions':{cancelWithdrawal:async()=>{}}}).default;
  return renderToStaticMarkup(await Section({userId:customer,walletEnabled:true,balance:50}));
 }
 assert.equal(await render(false),'');
 assert.match(await render(true),/Request withdrawal/);
 const html=await render(false,[{id:key,amount:100,status:'REQUESTED'}]);
 assert.match(html,/Reserved/);assert.match(html,/100.00/);assert.match(html,/Cancel request/);assert.doesNotMatch(html,/Request withdrawal/);
 const approved=await render(true,[{id:key,amount:100,status:'APPROVED'}]);assert.doesNotMatch(approved,/Cancel request|Request withdrawal/);
 assert.match(await render(true,[],{message:'secret'}),/temporarily unavailable/);
});
