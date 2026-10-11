const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
function load(file,mocks){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:n=>{if(n in mocks)return mocks[n];throw Error('Missing mock '+n)},URLSearchParams,console});return exports;}
const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0');
test('Discount reads use authenticated identity, all product batches, and no shared cache',async()=>{
 const calls=[];let fail=false;
 const data=load('lib/business-catalog-discounts.ts',{'server-only':{},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return fail?{error:{}}:{data:args.p_products.map(p=>({product_id:p,discount_percent:12.5})),error:null}}})}});
 const ids=Array.from({length:1100},(_,i)=>id(i));const result=await data.businessCatalogDiscounts(id(5000),[...ids,ids[0]]);
 assert.equal(Object.keys(result).length,1100);assert.equal(result[ids[0]],12.5);assert.deepEqual(calls.map(c=>c.args.p_products.length),[500,500,100]);assert(calls.every(c=>c.name==='get_business_customer_discounts'&&c.args.p_user===id(5000)));
 await data.businessCatalogDiscounts(id(5001),[ids[0]]);assert.equal(calls.at(-1).args.p_user,id(5001));
 fail=true;await assert.rejects(data.businessCatalogDiscounts(id(5000),ids),/Unable to load/);
});
test('Admin saves require trusted admin identity and reject malformed percentages before writes',async()=>{
 const calls=[],paths=[];let denied=false,error=null;
 const action=load('app/admin/b2b-products/actions.ts',{'next/cache':{revalidatePath:p=>paths.push(p)},'@/lib/business-verification-data':{requireBusinessAdmin:async()=>{if(denied)throw Error('Admin required');return {id:id(90)}}},'@/lib/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{calls.push({name,args});return {data:1,error}}})}}).saveB2BDiscounts;
 const input=()=>({email:'buyer@example.com',customerId:id(10),changes:[{productId:id(1),percent:5,revision:null}]});
 denied=true;await assert.rejects(action(input()),/Admin required/);assert.equal(calls.length,0);denied=false;
 for(const percent of [-1,100,NaN,Infinity,'5',1.234]){const v=input();v.changes[0].percent=percent;assert((await action(v)).error);}
 assert((await action({...input(),changes:[]})).error);assert.equal(calls.length,0);
 assert((await action(input())).success);assert.equal(calls[0].args.p_admin,id(90));assert.equal(calls[0].args.p_customer,id(10));assert.equal(calls[0].args.p_email,'buyer@example.com');assert.equal(paths.join(','),'/admin/b2b-products,/account/portal/new');
 error={message:'Discount settings changed. Refresh and try again.'};assert.match((await action(input())).error,/settings changed/);
 error={message:'password=secret internal database error'};assert.doesNotMatch((await action(input())).error,/secret/);
});
test('All-product catalog keeps products visible on setup failures and scopes discount edits to registered users',async()=>{
 const calls=[];let found=false;let failedTable=null;let failureCode='PGRST205';
 const rows={products:[{id:id(1),name:'Card',region:'India',status:'ACTIVE',business_enabled:true,is_preorder_only:false,category_id:id(5),categories:{name:'Games'}}],business_product_discounts:[{product_id:id(1),discount_percent:5,revision:id(2)}],business_customer_product_discounts:[{product_id:id(1),discount_percent:9,revision:id(3)}],seller_product_submissions:[]};
 const db={rpc:async(name,args)=>{calls.push([name,args]);return {data:found?[{user_id:id(10),email:'buyer@example.com'}]:[],error:null}},from(table){const r=table===failedTable?{data:null,count:null,error:{code:failureCode}}:{data:rows[table],count:1,error:null};const query=new Proxy({}, {get(_,method){if(method==='then')return(resolve)=>Promise.resolve(r).then(resolve);return(...args)=>{calls.push([table,method,...args]);return query}}});return query}};
 const jsx=(type,props)=>({type,props}),Editor=()=>{};
 const page=load('app/admin/b2b-products/page.tsx',{'react/jsx-runtime':{jsx,jsxs:jsx},'next/link':{},'next/form':{},'@/lib/admin-b2b-filters':load('lib/admin-b2b-filters.ts',{}),'@/lib/business-verification-data':{requireBusinessAdmin:async()=>({id:id(90)})},'@/lib/supabase/admin':{createAdminClient:()=>db},'./DiscountEditor':{default:Editor}}).default;
 const all=node=>!node||typeof node!=='object'?[]:Array.isArray(node)?node.flatMap(all):[node,...all(node.props?.children)];
 let view=all(await page({searchParams:Promise.resolve({email:'not-registered@example.com'})}));assert(view.some(n=>n.props?.role==='alert'));assert.equal(view.find(n=>n.type===Editor).props.canEditDiscounts,false);
 assert(!calls.some(c=>c[0]==='products'&&c[1]==='eq'&&c[2]==='business_enabled'),'Initial catalog includes products not yet enabled for B2B');
 found=true;calls.length=0;view=all(await page({searchParams:Promise.resolve({email:'BUYER@example.com'})}));
 const editor=view.find(n=>n.type===Editor);assert.equal(editor.props.customerId,id(10));assert.equal(editor.props.products[0].percent,9);assert.equal(editor.props.products[0].general,5);
 assert(calls.some(c=>c[0]==='business_customer_product_discounts'&&c[1]==='eq'&&c[2]==='user_id'&&c[3]===id(10)));
 for(const table of ['business_product_discounts','business_customer_product_discounts','seller_product_submissions']){
  failedTable=table;view=all(await page({searchParams:Promise.resolve({email:'buyer@example.com'})}));
  assert(view.some(n=>n.props?.role==='alert'),'Settings failure has a visible explanation');
  const preview=view.find(n=>n.type===Editor);assert(preview,'Missing setup cannot hide existing products');assert.equal(preview.props.canEditDiscounts,false,'No discount saves with unknown settings');assert.equal(preview.props.products[0].name,'Card');assert.equal(preview.props.products[0].businessEnabled,true);
 }
 failedTable='business_product_discounts';failureCode='42501';
 view=all(await page({searchParams:Promise.resolve({})}));
 assert(view.some(n=>n.props?.role==='alert'&&n.props.children.includes('could not be loaded')),'Unrelated read errors are not misreported as missing setup');
 failedTable='products';view=all(await page({searchParams:Promise.resolve({})}));
 assert(view.some(n=>n.props?.role==='alert'&&n.props.children.includes('Unable to load the B2B catalog')));
 assert(!view.some(n=>n.type===Editor),'A failed product query is never shown as an empty successful catalog');
 failedTable=null;calls.length=0;await page({searchParams:Promise.resolve({email:'buyer@example.com',q:'Steam_50',category:id(5),region:'India',status:'ACTIVE',availability:'disabled',page:'2'})});
 for(const [key,value] of [['category_id',id(5)],['region','India'],['status','ACTIVE'],['business_enabled',false]])assert(calls.some(c=>c[0]==='products'&&c[1]==='eq'&&c[2]===key&&c[3]===value));
 assert(calls.some(c=>c[0]==='products'&&c[1]==='range'&&c[2]===20&&c[3]===39),'Page 2 loads exactly its 20 products');
 assert(calls.some(c=>c[0]==='products'&&c[1]==='ilike'&&c[3]==='%Steam\\_50%'));
 calls.length=0;view=all(await page({searchParams:Promise.resolve({status:'ACTIVE',availability:'enabled'})}));
 for(const [key,value] of [['business_enabled',true],['status','ACTIVE'],['is_preorder_only',false]])assert(calls.some(c=>c[0]==='products'&&c[1]==='eq'&&c[2]===key&&c[3]===value),'Active B2B list must match customer portal eligibility');
 const activeLink=view.find(n=>n.props?.href?.includes('availability=enabled')&&n.props?.['aria-current']==='page');assert(activeLink,'Active B2B list has a clear selected tab');
 assert(view.some(n=>n.type==='h2'&&n.props.children==='Active B2B products'));



});

test('B2B filters search the full catalog by default and pagination preserves the customer and every filter',()=>{
 const helpers=load('lib/admin-b2b-filters.ts',{}),defaults=helpers.b2bFilters({});
 assert.equal(defaults.availability,'all');assert.equal(defaults.status,'ALL');
 const filters=helpers.b2bFilters({email:' BUYER@EXAMPLE.COM ',q:' Steam ',category:id(5),region:'India',status:'DRAFT',availability:'disabled'});
 const url=new URL(helpers.b2bCatalogUrl(filters,3),'http://localhost');
 for(const [key,value] of Object.entries(filters))assert.equal(url.searchParams.get(key),value);
 assert.equal(url.searchParams.get('page'),'3');assert.equal(helpers.b2bFilters({category:'bad',status:'bad',availability:'bad'}).category,'');
 for(const [view,status,availability] of [['active','ACTIVE','enabled'],['all','ALL','all'],['disabled','ALL','disabled']]){
  const target=new URL(helpers.b2bCatalogView(filters,view),'http://localhost');
  assert.equal(target.searchParams.get('status'),status);assert.equal(target.searchParams.get('availability'),availability);assert.equal(target.searchParams.get('page'),null);
  for(const key of ['email','q','category','region'])assert.equal(target.searchParams.get(key),filters[key]);
 }

});
test('Bulk B2B activation is admin-only, changes only selected channel flags, and needs no new discount tables',async()=>{
 const writes=[],paths=[],tags=[];let denied=false,readError=false,writeError=false;
 let rows=[{id:id(1),business_enabled:false,status:'ACTIVE',is_preorder_only:false},{id:id(2),business_enabled:true,status:'DRAFT',is_preorder_only:false}],readCount=0;
 const db={from(table){assert.equal(table,'products');let change=null;const filters=[];const query={select(){return query},in(k,v){filters.push([k,v]);return query},eq(k,v){filters.push([k,v]);return query},update(value){change=value;return query},then(resolve,reject){
  if(change){writes.push({change,filters});const ids=filters.find(([k])=>k==='id')[1];return Promise.resolve({data:rows.filter(r=>ids.includes(r.id)),error:writeError?{}:null}).then(resolve,reject);}
  readCount++;return Promise.resolve({data:rows,error:readError?{}:null}).then(resolve,reject);
 }};return query}};
 const action=load('app/admin/b2b-products/actions.ts',{'next/cache':{revalidatePath:p=>paths.push(p),updateTag:t=>tags.push(t)},'@/lib/business-verification-data':{requireBusinessAdmin:async()=>{if(denied)throw Error('Admin required');return {id:id(90)}}},'@/lib/supabase/admin':{createAdminClient:()=>db}}).setB2BProductAvailability;
 denied=true;await assert.rejects(action([id(1)],true),/Admin/);assert.equal(readCount,0);denied=false;
 for(const [ids,enabled] of [[[],true],[['bad'],true],[[id(1)],'true'],[Array(201).fill(id(1)),false]])assert((await action(ids,enabled)).error);
 assert.equal(readCount,0);
 assert((await action([id(1),id(2)],true)).success);assert.equal(writes.length,1);assert.equal(writes[0].change.business_enabled,true);assert.equal(writes[0].change.status,undefined);assert.equal(writes[0].change.retail_enabled,undefined);assert.equal(writes[0].filters.find(([k])=>k==='id')[1].join(','),id(1));assert(writes[0].filters.some(([k,v])=>k==='business_enabled'&&v===false));
 assert(tags.includes('business-catalogue'));assert(paths.includes('/account/portal/new'));
 assert((await action([id(1),id(2)],false)).success);assert.equal(writes[1].change.business_enabled,false);assert.equal(writes[1].filters.find(([k])=>k==='id')[1].join(','),id(2));
 const count=writes.length;rows=[rows[1]];assert((await action([id(2),id(2)],true)).success);assert.equal(writes.length,count);
 rows=[{...rows[0],is_preorder_only:true}];assert((await action([id(2)],false)).error);assert.equal(writes.length,count);
 rows=[];assert((await action([id(1)],true)).error);assert.equal(writes.length,count);
 rows=[{id:id(1),business_enabled:false,status:'DRAFT',is_preorder_only:false}];readError=true;assert((await action([id(1)],true)).error);assert.equal(writes.length,count);readError=false;
 writeError=true;assert((await action([id(1)],true)).error);writeError=false;
 assert.match((await action([id(1)],true)).success,/still needs publishing/);
});
