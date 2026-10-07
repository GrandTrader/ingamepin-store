const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,deps){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:name=>{if(name in deps)return deps[name];throw Error('Unexpected '+name);},FormData});return exports;}
const logic=load('lib/product-range.ts',{}),markupLogic=load('lib/range-markup.ts',{});
function setup({signedIn=true,admin=true,ready=false,preview=true,currency='USD'}={}){
 const calls=[];
 const item={sku:'TEST-USD',currency,minimum:'2',maximum:'500',increment:'0.01',discountPercent:2};
 const session={auth:{getUser:async()=>({data:{user:signedIn?{id:'admin'}:null}})},from:()=>({select(){return this;},eq(){return this;},maybeSingle:async()=>({data:admin?{user_id:'admin'}:null})})};
 const deps={'next/navigation':{redirect:url=>{throw Error(url);}},'next/cache':{revalidatePath:()=>{}},'@/lib/supabase/admin-session':{createClient:async()=>session},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {error:null};}})},'@/lib/range-markup':markupLogic,'@/lib/product-range':logic,'@/lib/definiteplay-open-value-connection':{getOpenValueConnection:async()=>{calls.push({catalogue:true});return {ready,preview,items:[item]};}}};
 const action=load('app/admin/products/[id]/edit/product-options/range-actions.ts',deps).saveRangeOption;
 const form=changes=>{const f=new FormData();for(const [key,value] of Object.entries({id:'00000000-0000-4000-8000-000000000001',currency,minimum:'2',maximum:'500',step:'0.01',price_basis:'100',price_usd:'103',delivery_mode:'SUPPLIER',supplier:'DEFINITEPLAY',supplier_reference:'TEST-USD',...changes}))f.set(key,value);return f;};
 return {action,calls,form};
}
test('unauthenticated and non-admin requests cannot load catalogue or save settings',async()=>{
 for(const options of [{signedIn:false},{admin:false}]){const h=setup(options);await assert.rejects(h.action(h.form()),/admin\/login/);assert.equal(h.calls.length,0);}
});
test('disabled import saves only the range on the chosen existing product',async()=>{
 const h=setup();await assert.rejects(h.action(h.form()),/success=/);const writes=h.calls.filter(c=>c.name);assert.equal(writes.length,1);assert.equal(writes[0].name,'save_product_range');assert.equal(writes[0].args.p_product_id,'00000000-0000-4000-8000-000000000001');assert.equal(writes[0].args.p_settings.enabled,false);assert.equal(writes[0].args.p_settings.supplier_reference,'TEST-USD');
});
test('preview, unready worker and foreign currency cannot activate supplier purchasing',async()=>{
 for(const opts of [{},{ready:true,preview:true},{ready:false,preview:false},{ready:true,preview:false,currency:'GBP'}]){const h=setup(opts);await assert.rejects(h.action(h.form({enabled:'on'})),/error=/);assert.equal(h.calls.filter(c=>c.name).length,0);}
});
test('forged SKU, wider bounds, different currency and misaligned increment are rejected',async()=>{
 for(const change of [{supplier_reference:'OTHER'},{minimum:'1'},{maximum:'501'},{currency:'EUR'},{step:'0.001'}]){const h=setup({ready:true,preview:false});await assert.rejects(h.action(h.form(change)),/error=/);assert.equal(h.calls.filter(c=>c.name).length,0);}
});
test('validated live USD configuration reaches database readiness validation',async()=>{
 const h=setup({ready:true,preview:false});await assert.rejects(h.action(h.form({enabled:'on'})),/success=/);assert.equal(h.calls.find(c=>c.name).args.p_settings.enabled,true);
});

test('percentage save ignores forged price and supplier discount, using the catalogue cost',async()=>{
 const h=setup({ready:true,preview:false});await assert.rejects(h.action(h.form({enabled:'on',markup_percent:'5',price_usd:'0.01',supplier_discount_percent:'99'})),/success=/);
 const write=h.calls.find(c=>c.name);assert.equal(write.name,'save_supplier_range_percentage');assert.equal(write.args.p_settings.price_usd,102.9);assert.equal(write.args.p_settings.markup_percent,5);assert.equal(write.args.p_settings.supplier_discount_percent,2);
});
test('invalid markup or unverified foreign currency never saves a percentage price',async()=>{
 for(const markup of ['', '-1','1001','5.001','NaN','Infinity','1e2']){const h=setup();await assert.rejects(h.action(h.form({markup_percent:markup})),/error=/);assert.equal(h.calls.filter(c=>c.name).length,0);}
 const h=setup({currency:'GBP'});await assert.rejects(h.action(h.form({markup_percent:'5'})),/error=/);assert.equal(h.calls.filter(c=>c.name).length,0);
});
test('zero markup is accepted with protected final rounding',async()=>{
 const h=setup();await assert.rejects(h.action(h.form({markup_percent:'0'})),/success=/);assert.equal(h.calls.find(c=>c.name).args.p_settings.price_usd,98);
});
