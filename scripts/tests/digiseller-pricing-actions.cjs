const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
function load(file,imports){const exports={};new Function('require','exports',ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(name=>name in imports?imports[name]:require(name),exports);return exports;}
(async()=>{
 const pricing=load('lib/digiseller-pricing.ts',{});
 const option={id:'a',is_active:true,option_name:'2 USD',selling_price:2.3,digiseller_product_id:100,digiseller_option_id:null,digiseller_variant_id:null};
 const snapshot={id:100,base:2.3,currency:'USD',enabled:true,parameters:[]};
 let authorized=true,shared=0,writes=0,locks=0,finishes=[],failWrite=false,failFinish=false,allOptions=[option],mappingWrites=[],mappingConflict=false,restoreOptions;
 const db={from(table){let update,ordered=false;const q={update(value){update=value;return q},select(){return q},eq(){return q},is(){return q},in(){return q},neq(){return q},order(){ordered=true;return q},then(resolve){if(update){mappingWrites.push(update);resolve({data:mappingConflict?[]:[{id:'a'}]});}else resolve(ordered?{data:allOptions}:{count:shared})},single:async()=>({data:{recovery_snapshot:[snapshot]}})};return q;},rpc:async(name,args)=>{
   if(name==='begin_digiseller_price_sync'){locks++;return {data:'lock-token'};}
   finishes.push(args);return failFinish?{error:{message:'connection lost'}}:{data:null};
 }};
 const session={auth:{getUser:async()=>({data:{user:{id:'admin'}}})},from(){return {select(){return this},eq(){return this},maybeSingle:async()=>({data:authorized?{user_id:'admin'}:null})}}};
 const oldKey=process.env.DIGISELLER_API_KEY;process.env.DIGISELLER_API_KEY='test-secret';
 const actions=load('app/admin/products/[id]/edit/stock/pricing-actions.ts',{
  'next/cache':{revalidatePath(){}},'@/lib/supabase/admin-session':{createClient:async()=>session},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/digiseller-pricing':pricing,
  '@/lib/digiseller-price-api':{readPriceSnapshots:async()=>[snapshot],targetPriceSnapshots:plan=>plan.products.map(p=>({...p.before,base:p.base})),writePriceSnapshots:async(s,opts)=>{writes++;restoreOptions=opts;if(failWrite&&writes===1)throw Error('connection lost');},writeDenominationPlan:async(plan,save)=>{writes++;await save(plan.products[0].rows.map(r=>({...r,variantId:r.variantId??12})));}},
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
 writes=0;failFinish=false;option.digiseller_option_id=20;option.digiseller_variant_id=10;
 snapshot.parameters=[{id:20,type:'radio',required:true,variants:[{variant_id:10,name:[{locale:'en-US',value:'2 USD'}],type:'priceplus',rate:0,is_default:true,visible:true,order:1}]}];
 preview=await actions.previewDigiSellerPrices('product','5');const previousLocks=locks;
 result=await actions.applyDigiSellerPrices('product','5',preview.approval,'denominations');assert.equal(result.success,false);assert.equal(locks,previousLocks,'price-only approval cannot authorize structural changes');
 allOptions.push({id:'b',is_active:true,option_name:'10 USD',selling_price:11.5,digiseller_product_id:null,digiseller_option_id:null,digiseller_variant_id:null});
 preview=await actions.previewDigiSellerPrices('product','5','denominations');assert.equal(preview.error,null);assert.equal(preview.rows[1].change,'Add');assert.equal(writes,0);
 result=await actions.applyDigiSellerPrices('product','5',preview.approval,'denominations');assert.equal(result.success,true);assert.equal(mappingWrites.length,2);assert.equal(mappingWrites[1].digiseller_variant_id,12);
 mappingConflict=true;writes=0;preview=await actions.previewDigiSellerPrices('product','5','denominations');result=await actions.applyDigiSellerPrices('product','5',preview.approval,'denominations');assert.equal(result.success,false);assert.equal(writes,2);assert.equal(restoreOptions.restore,true,'mapping conflict restores original snapshot and hides new variants');
 allOptions=[{...option,is_active:false},allOptions[1]];preview=await actions.previewDigiSellerPrices('product','5','denominations');assert.equal(preview.error,null);assert.deepEqual(preview.rows.map(r=>r.change),['Add','Hide'],'inactive mappings locate listing after replacing all denominations');
 if(oldKey===undefined)delete process.env.DIGISELLER_API_KEY;else process.env.DIGISELLER_API_KEY=oldKey;
 console.log('PASS: admin authorization, preview without writes, approval binding, changed prices, shared listings, sync, rollback and uncertain completion.');
})().catch(e=>{console.error(e);process.exitCode=1});
