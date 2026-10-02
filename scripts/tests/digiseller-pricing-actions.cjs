const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,imports){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name in imports?imports[name]:require(name),exports);return exports;}
(async()=>{
 const pricing=load('lib/digiseller-pricing.ts',{});
 const option={id:'a',option_name:'2 USD',selling_price:2.3,digiseller_product_id:100,digiseller_option_id:null,digiseller_variant_id:null};
 const snapshot={id:100,base:2.3,currency:'USD',enabled:true,parameters:[]};
 let authorized=true,shared=0,writes=0,locks=0,finishes=[],failWrite=false,failFinish=false;
 const db={from(table){const q={select(){return q},eq(){return q},in(){return q},neq(){return q},order:async()=>({data:[option]}),then(resolve){resolve({count:shared})},single:async()=>({data:{recovery_snapshot:[snapshot]}})};return q;},rpc:async(name,args)=>{
   if(name==='begin_digiseller_price_sync'){locks++;return {data:'lock-token'};}
   finishes.push(args);return failFinish?{error:{message:'connection lost'}}:{data:null};
 }};
 const session={auth:{getUser:async()=>({data:{user:{id:'admin'}}})},from(){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:authorized?{user_id:'admin'}:null})}}};
 const oldKey=process.env.DIGISELLER_API_KEY;process.env.DIGISELLER_API_KEY='test-secret';
 const actions=load('app/admin/products/[id]/edit/stock/pricing-actions.ts',{
  'next/cache':{revalidatePath(){}},'@/lib/supabase/admin-session':{createClient:async()=>session},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/digiseller-pricing':pricing,
  '@/lib/digiseller-price-api':{readPriceSnapshots:async()=>[snapshot],targetPriceSnapshots:plan=>plan.products.map(p=>({...p.before,base:p.base})),writePriceSnapshots:async()=>{writes++;if(failWrite&&writes===1)throw Error('connection lost');}},
 });
 authorized=false;await assert.rejects(()=>actions.previewDigiSellerPrices('product','5'));assert.equal(writes+locks,0);authorized=true;
 let preview=await actions.previewDigiSellerPrices('product','5');assert.equal(preview.rows[0].next,2.42);assert.equal(writes+locks,0);
 let result=await actions.applyDigiSellerPrices('product','50',preview.approval);assert.equal(result.success,false);assert.equal(writes+locks,0,'changed percentage cannot reuse approval');
 result=await actions.applyDigiSellerPrices('other-product','5',preview.approval);assert.equal(result.success,false);assert.equal(writes+locks,0);
 option.selling_price=2.4;result=await actions.applyDigiSellerPrices('product','5',preview.approval);assert.equal(result.success,false);assert.equal(writes+locks,0);option.selling_price=2.3;
 shared=1;preview=await actions.previewDigiSellerPrices('product','5');assert(preview.error);assert.equal(writes+locks,0);shared=0;
 preview=await actions.previewDigiSellerPrices('product','5');result=await actions.applyDigiSellerPrices('product','5',preview.approval);assert.equal(result.success,true);assert.equal(writes,1);assert.equal(finishes.at(-1).p_success,true);
 writes=0;failWrite=true;preview=await actions.previewDigiSellerPrices('product','5');result=await actions.applyDigiSellerPrices('product','5',preview.approval);assert.equal(result.success,false);assert.equal(writes,2);assert.equal(result.needsRecovery,false);assert.equal(finishes.at(-1).p_restored,true);
 writes=0;failWrite=false;failFinish=true;preview=await actions.previewDigiSellerPrices('product','5');result=await actions.applyDigiSellerPrices('product','5',preview.approval);assert.equal(writes,1,'uncertain completion does not roll back verified prices');assert.equal(result.needsRecovery,true);
 if(oldKey===undefined)delete process.env.DIGISELLER_API_KEY;else process.env.DIGISELLER_API_KEY=oldKey;
 console.log('PASS: admin authorization, preview without writes, approval binding, changed prices, shared listings, sync, rollback and uncertain completion.');
})().catch(e=>{console.error(e);process.exitCode=1});
