const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,deps={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports,require:n=>{if(n in deps)return deps[n];throw Error('Unmocked '+n)},console,Date,Set,Error,URL});return exports;}
const sync=load('lib/product-editor-sync.ts');
const redirect=url=>{throw Error('redirect:'+url)};
test('product save verifies user once per request and still requires MFA',async()=>{
 let calls=0,mfa=0;const sessions=[];
 const api=load('lib/supabase/admin-session.ts',{'server-only':{},'next/navigation':{redirect},'./server':{createClient:async()=>{const c={auth:{getUser:async()=>{calls++;return{data:{user:{id:String(sessions.length)}}}}}};sessions.push(c);return c;}},'@/lib/admin-assurance':{hasRequiredAdminAssurance:async()=>{mfa++;return true;}}});
 const a=await api.createClient({reuseVerifiedUser:true});await a.auth.getUser();await a.auth.getUser();assert.equal(calls,1);assert.equal(mfa,1);
 const b=await api.createClient({reuseVerifiedUser:true});await b.auth.getUser();assert.equal(calls,2);assert.equal(mfa,2);assert.notEqual(a,b);
 await b.auth.getUser('explicit-token');assert.equal(calls,3);
 for(const verified of [false,true]){const denied=load('lib/supabase/admin-session.ts',{'server-only':{},'next/navigation':{redirect},'./server':{createClient:async()=>({auth:{getUser:async()=>({data:{user:verified?{id:'admin'}:null}})}})},'@/lib/admin-assurance':{hasRequiredAdminAssurance:async()=>false}});await assert.rejects(denied.createClient({reuseVerifiedUser:true}),/redirect:\/admin\/login/);}
});
test('external sync is bounded to three concurrent updates and finishes started work on failure',async()=>{
 let active=0,max=0,finished=0;await assert.rejects(sync.syncProductTargets([1,2,3,4,5,6,7],async id=>{active++;max=Math.max(max,active);await new Promise(r=>setTimeout(r,5));active--;finished++;if(id===2)throw Error('failed');}),/failed/);assert.equal(max,3);assert.equal(finished,7);assert.equal(active,0);
});
function fixture(kind,{oldName='Game',oldImage='https://example.test/a.png',fail=false,retry=false,admin=true,signedIn=true}={}){
 const writes=[],external=[],reads=[];
 const db={auth:{getUser:async()=>({data:{user:signedIn?{id:'admin'}:null}})},from(table){reads.push(table);const q={};for(const m of ['select','eq','not'])q[m]=()=>q;q.update=v=>{writes.push(v);return q};
 const result=()=>({error:null,data:table==='admin_users'?(admin?{user_id:'admin'}:null):table==='categories'?{category_type:'GIFT_CARD',name:'Gift cards',slug:'gift-cards'}:table==='products'?{name:oldName,name_ru:null,image_url:oldImage,region:'Global'}:table==='product_options'?[{digiseller_product_id:123},{digiseller_product_id:456}]:null});q.single=q.maybeSingle=async()=>result();q.then=(a,b)=>Promise.resolve(result()).then(a,b);return q;}};
 const externalCall=async id=>{external.push(id);if(fail)throw Error('Supplier down');};
 const api=load('app/admin/products/[id]/edit/'+kind+'/actions.ts',{'next/cache':{revalidatePath(){}},'next/navigation':{redirect},'@/lib/product-editor-sync':sync,'@/lib/game-platforms':{isGamesCategory:()=>false,normalizeGamePlatforms:()=>[],validGamePlatforms:()=>true},'@/lib/supabase/admin-session':{createClient:async()=>db},'@/lib/supabase/admin':{createAdminClient:()=>db},'@/lib/store-image-upload':{uploadStoreImage:async()=>null},'@/lib/digiseller-api':{updateDigiSellerProductName:externalCall,uploadDigiSellerProductImage:externalCall}});
 const f=new FormData();for(const[k,v]of Object.entries({id:'product',name:'Game',name_ru:'',category_id:'category',region:'Global',image_url:'https://example.test/a.png',retry_digiseller_sync:retry?'true':'false'}))f.set(k,v);
 return{writes,external,reads,save:()=>kind==='general'?api.updateProductGeneral(f):api.saveProductGallery('product',f)};
}
test('unchanged names and images save locally without supplier lookups or uploads',async()=>{for(const kind of ['general','gallery']){const f=fixture(kind);await assert.rejects(f.save(),/success=/);assert.equal(f.writes.length,1);assert.equal(f.external.length,0);assert.ok(!f.reads.includes('product_options'));}});
test('changed content and explicit failure retries still update all linked products',async()=>{for(const kind of ['general','gallery'])for(const opts of [{oldName:'Old name',oldImage:'https://example.test/old.png'},{retry:true}]){const f=fixture(kind,opts);await assert.rejects(f.save(),/success=/);assert.deepEqual(f.external.sort(),[123,456]);}});
test('sync failure reports saved-but-not-synced, and unauthorized saves cannot write',async()=>{for(const kind of ['general','gallery']){const failed=fixture(kind,{retry:true,fail:true});await assert.rejects(failed.save(),/error=/);assert.equal(failed.writes.length,1);for(const opts of [{admin:false},{signedIn:false}]){const denied=fixture(kind,opts);await assert.rejects(denied.save(),/admin\/login/);assert.equal(denied.writes.length,0);assert.equal(denied.external.length,0);}}});
