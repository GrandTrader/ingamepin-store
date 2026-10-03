const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript');
function load(file,mocks={}){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name in mocks?mocks[name]:require(name),exports);return exports;}
const logic=load('lib/affiliate-product-settings.ts');
const a='00000000-0000-4000-8000-000000000001',b='00000000-0000-4000-8000-000000000002';
const products=[{id:a,name:'Apple India',category_id:'apple',region:'IN',status:'ACTIVE',affiliate_enabled:false},{id:b,name:'Steam USA',category_id:'steam',region:'US',status:'INACTIVE',affiliate_enabled:true}];
const empty={search:'',category:'',region:'',status:'',affiliate:''};
assert.equal(logic.filterAffiliateProducts(products,{...empty,search:' APPLE ',region:'IN',status:'ACTIVE',affiliate:'DISABLED'})[0].id,a);
assert.equal(logic.filterAffiliateProducts(products,{...empty,category:'steam'})[0].id,b);
assert.deepEqual(logic.filterAffiliateProducts(products,{...empty,search:'missing'}),[]);
const change={id:a,enabled:true,commission:2.25};
assert.deepEqual(logic.parseAffiliateProductChanges([change]),[change]);
for(const input of [[],null,[change,change],[{...change,id:'bad'}],[{...change,enabled:'false'}],[{...change,commission:0}],[{...change,commission:25.01}],[{...change,commission:2.001}],[{...change,commission:NaN}],[{...change,commission:'2'}]])assert.throws(()=>logic.parseAffiliateProductChanges(input));
(async()=>{
  let loggedIn=true,isAdmin=true,rpcCalls=[];
  const actions=load('app/admin/affiliates/actions.ts',{
    'next/cache':{revalidatePath(){}},'next/navigation':{redirect:()=>{throw Error('REDIRECT');}},
    '@/lib/affiliate-product-settings':logic,
    '@/lib/supabase/admin-session':{createClient:async()=>({auth:{getUser:async()=>({data:{user:loggedIn?{id:'admin'}:null}})},from:()=>({select:()=>({eq:()=>({maybeSingle:async()=>({data:isAdmin?{user_id:'admin'}:null})})})})})},
    '@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{rpcCalls.push({name,args});return{data:args.p_changes.length,error:null};}})},
  });
  loggedIn=false;await assert.rejects(actions.saveDisplayedAffiliateProducts([change]),/REDIRECT/);assert.equal(rpcCalls.length,0);
  loggedIn=true;isAdmin=false;await assert.rejects(actions.saveDisplayedAffiliateProducts([change]),/REDIRECT/);assert.equal(rpcCalls.length,0);
  isAdmin=true;assert.equal((await actions.saveDisplayedAffiliateProducts([{...change,commission:30}])).ok,false);assert.equal(rpcCalls.length,0);
  assert.equal((await actions.saveDisplayedAffiliateProducts([change])).ok,true);
  assert.deepEqual(rpcCalls,[{name:'save_displayed_affiliate_products',args:{p_changes:[change]}}],'Save must send only displayed product IDs and settings');
  console.log('PASS: combined filters, validation, admin authorization and exact displayed-product payload.');
})().catch(e=>{console.error(e);process.exitCode=1;});
