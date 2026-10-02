const fs=require('fs'),ts=require('typescript'),vm=require('vm'),assert=require('node:assert/strict'),crypto=require('crypto');
(async()=>{
 let source='DEFINITEPLAY',stock=1000,stockError=null,purchaseCalls=0,rpcs=[],goods=null;
 let purchase={productId:6203684,invoiceState:3,quantity:2,amount:5,amountUsd:5,profit:4.5,options:[{id:6600439,user_data_id:34383429}]};
 const option={id:'option2',product_id:'product'};
 const db={from(table){let variant=[];const q={select(){return q},eq(){return q},is(){return q},in(name,values){if(name==='digiseller_variant_id')variant=values;return q},single:async()=>({data:{stock_source:source}}),maybeSingle:async()=>table==='digiseller_supplier_jobs'?{data:null}:{data:variant.includes(34383429)?option:null},then(resolve){resolve(table==='gift_card_codes'?{count:3}:{data:[option]})}};return q;},rpc:async(name,args)=>{rpcs.push({name,args});if(name==='digiseller_supplier_available')return {data:stock,error:stockError};if(name==='queue_digiseller_supplier_order')return {data:goods};if(name==='fulfill_digiseller_order')return {data:[{goods:'owned-code'}]};throw Error(name)}};
 const exports={};const code=ts.transpileModule(fs.readFileSync('app/api/digiseller/supplier/route.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 vm.runInNewContext(code,{exports,Buffer,process:{env:{DIGISELLER_API_KEY:'test-key'}},require:name=>({
 'node:crypto':crypto,'next/server':{NextResponse:{json:body=>body}},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/digiseller-api':{getDigiSellerPurchaseSelection:async()=>{purchaseCalls++;return purchase}}
 }[name])});const post=body=>exports.POST({json:async()=>body});
 const quantity={product_id:6203684,count:1,options:[{id:6600439,user_data_id:34383429}]};
 assert.equal((await post(quantity)).count,1000);assert.equal(purchaseCalls,0);assert(rpcs.every(x=>x.name==='digiseller_supplier_available'));
 stockError={message:'missing migration'};assert.equal((await post(quantity)).count,0);stockError=null;source='OWNED';assert.equal((await post(quantity)).count,3);source='DEFINITEPLAY';
 const body={id:6203684,inv:123,amount:99999,options:[{user_data:999}],sign2:crypto.createHash('sha256').update('6203684:123:test-key').digest('hex')};
 rpcs=[];await post({...body,sign2:'bad'});assert.equal(purchaseCalls,0);assert.equal(rpcs.length,0);
 let result=await post(body);assert.equal(result.goods,undefined);let queued=rpcs.find(x=>x.name==='queue_digiseller_supplier_order');assert.equal(queued.args.p_option_id,'option2');assert.equal(queued.args.p_quantity,2);assert.equal(queued.args.p_net_revenue_usd,4.5);
 for(const change of [{invoiceState:1},{productId:999},{quantity:0},{quantity:1001},{profit:null},{profit:Infinity},{amount:0}]){rpcs=[];const old=purchase;purchase={...old,...change};await post(body);assert.equal(rpcs.length,0,JSON.stringify(change));purchase=old;}
 goods='code-a\n\ncode-b';assert.equal((await post(body)).goods,goods);
 const legacy={...body,sign2:undefined,sign:crypto.createHash('md5').update('6203684:123:test-key').digest('hex')};assert.equal((await post(legacy)).goods,goods);
 source='OWNED';assert.equal((await post(body)).goods,'owned-code');assert.equal((await post(null)).count,0);
 console.log('PASS: quantity-source routing, closed on failure, SHA256/MD5 verification, authoritative options/quantity/payment, pending and completed delivery, owned-stock compatibility.');
})().catch(e=>{console.error(e);process.exit(1)});
