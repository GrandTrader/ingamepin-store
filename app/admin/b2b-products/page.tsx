import Form from "next/form";
import { b2bFilters, b2bCatalogUrl, b2bCatalogView, type B2BFilters } from "@/lib/admin-b2b-filters";
import Link from "next/link";
import { requireBusinessAdmin } from "@/lib/business-verification-data";
import { createAdminClient } from "@/lib/supabase/admin";
import DiscountEditor, { type DiscountProduct } from "./DiscountEditor";

export default async function B2BProductCatalog({searchParams}:{searchParams:Promise<Partial<B2BFilters>&{page?:string}>}) {
  const admin=await requireBusinessAdmin(), params=await searchParams, db=createAdminClient();
  const filters=b2bFilters(params),{email,q,category,region,status,availability}=filters;
  const page=Math.max(1,Math.min(100000,Number.parseInt(params.page??"1",10)||1)), size=20;
  let customerId:string|null=null, customerEmail=email, problem="";
  if(email){
    const customer=await db.rpc("find_business_discount_customer",{p_admin:admin.id,p_email:email});
    if(customer.error) problem=customer.error.code==="PGRST202"?"Discount setup is pending. Products are listed below; customer discounts will be available after the database update.":"Unable to look up the customer. Products are listed below; refresh to try again.";
    else if(!customer.data?.length) problem="This email is not registered. Enter the customer's registered email.";
    else {customerId=customer.data[0].user_id;customerEmail=customer.data[0].email;}
  }
  const choices=async()=>{
    const categories=new Map<string,string>(),regions=new Set<string>();
    const counts={all:0,active:0,disabled:0};
    for(let from=0;;from+=500){
      const result=await db.from("products").select("id,region,category_id,status,business_enabled,is_preorder_only,categories(name)").order("id").range(from,from+499);
      if(result.error)return {categories:[] as [string,string][],regions:[] as string[],counts:null,error:true};
      for(const product of result.data){
        counts.all++;
        if(product.business_enabled&&product.status==="ACTIVE"&&!product.is_preorder_only)counts.active++;
        if(!product.business_enabled)counts.disabled++;
        regions.add(product.region||"Global");
        const parent=Array.isArray(product.categories)?product.categories[0]:product.categories;
        if(product.category_id&&parent?.name)categories.set(product.category_id,parent.name);
      }
      if(result.data.length<500)break;
    }
    return {categories:[...categories.entries()].sort((a,b)=>a[1].localeCompare(b[1])),regions:[...regions].sort(),counts,error:false};
  };
  let query=db.from("products").select("id,name,region,status,business_enabled,is_preorder_only",{count:"exact"});
  if(availability!=="all")query=query.eq("business_enabled",availability==="enabled");
  if(availability==="enabled")query=query.eq("is_preorder_only",false);
  if(status!=="ALL")query=query.eq("status",status);
  if(category)query=query.eq("category_id",category);
  if(region)query=region==="Global"?query.or("region.eq.Global,region.is.null,region.eq.\"\""):query.eq("region",region);
  if(q) query=query.ilike("name","%"+q.replace(/[\\%_]/g,"\\$&")+"%");
  const [products,filterChoices]=await Promise.all([query.order("name").order("id").range((page-1)*size,page*size-1),choices()]);
  const catalogProblem=products.error?"Unable to load the B2B catalog. Please refresh and try again.":"";
  const rows=products.data??[], ids=rows.map(p=>p.id);
  const [general,personal,sellers]=ids.length?await Promise.all([
    db.from("business_product_discounts").select("product_id,discount_percent,revision").in("product_id",ids),
    customerId?db.from("business_customer_product_discounts").select("product_id,discount_percent,revision").eq("user_id",customerId).in("product_id",ids):Promise.resolve({data:[],error:null}),
    db.from("seller_product_submissions").select("product_id").in("product_id",ids),
  ]):[{data:[],error:null},{data:[],error:null},{data:[],error:null}];
  const settingsError=general.error??personal.error??sellers.error;
  if(settingsError && !problem) problem=["PGRST205","42P01"].includes(settingsError.code)
    ?"Discount setup is pending. Products are listed below; discount editing will be available after the database update."
    :"Discount settings could not be loaded. Products are listed below; refresh to try again.";
  const data:DiscountProduct[]=rows.map(p=>{
    const base=general.data?.find(d=>d.product_id===p.id), specific=personal.data?.find(d=>d.product_id===p.id), rule=customerId?specific:base;
    return {...p,businessEnabled:p.business_enabled,preorder:p.is_preorder_only,general:Number(base?.discount_percent??0),percent:Number(rule?.discount_percent??0),revision:rule?.revision??null,locked:!!sellers.data?.some(s=>s.product_id===p.id)};
  });
  const url=(next:number)=>b2bCatalogUrl(filters,next);
  const listTitle=availability==="enabled"?(status==="ACTIVE"?"Active B2B products":"B2B-enabled products"):availability==="disabled"?"Products not enabled for B2B":"All website products";
  const views=[{key:"all" as const,label:"All website products",selected:availability==="all"&&status==="ALL"},{key:"active" as const,label:"Active B2B products",selected:availability==="enabled"&&status==="ACTIVE"},{key:"disabled" as const,label:"Not enabled for B2B",selected:availability==="disabled"&&status==="ALL"}];
  return <main className="space-y-5">
    <div><p className="text-xs font-bold uppercase tracking-widest text-cyan-700">Catalog</p><h1 className="mt-1 text-2xl font-bold">B2B Product Catalog</h1><p className="mt-2 text-sm text-slate-600">Search all website products, manage B2B availability and set B2B discounts. Retail prices and availability stay unchanged.</p></div>
    <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <h2 className="font-bold">Choose who receives the discount</h2>
      <Form key={email} action="/admin/b2b-products" className="flex flex-wrap items-end gap-3">
        {Object.entries(filters).filter(([key])=>key!=="email").map(([key,value])=><input key={key} type="hidden" name={key} value={value}/>)}
        <label className="min-w-0 flex-1 text-sm">Registered customer email <span className="text-slate-500">(optional)</span><input type="email" name="email" defaultValue={email} placeholder="customer@example.com" className="mt-2 w-full rounded-lg border border-slate-300 px-3 py-2.5"/></label>
        <button className="rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Load customer</button>
        <Link href={b2bCatalogUrl({...filters,email:""})} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold">General B2B discounts</Link>
      </Form>
      <p className="text-sm text-slate-600">Leave the email empty for general B2B discounts. A customer&apos;s discount applies only to the products you select. The largest applicable discount wins; discounts are not added together.</p>
    </section>
    {(catalogProblem||problem)&&<p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">{catalogProblem||problem}</p>}
    {!catalogProblem&&<section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold">{listTitle}</h2><p className="mt-1 break-all text-sm text-cyan-700">{problem?"You can browse products and change B2B availability. Discount editing is temporarily unavailable.":customerId?customerEmail:"For all B2B customers"}</p></div><span className="text-sm text-slate-500">{products.count??0} products</span></div>
      <nav aria-label="Product lists" className="flex flex-wrap gap-2">
        {views.map(view=><Link key={view.key} href={b2bCatalogView(filters,view.key)} scroll={false} aria-current={view.selected?"page":undefined} className={`rounded-lg border px-4 py-2.5 text-sm font-semibold ${view.selected?"border-blue-600 bg-blue-600 text-white":"border-slate-300 bg-white text-slate-700"}`}>
          {view.label}{filterChoices.counts&&<span className="ml-2 rounded-full bg-black/10 px-2 py-0.5 text-xs">{filterChoices.counts[view.key]}</span>}
        </Link>)}
      </nav>
      <Form key={JSON.stringify(filters)} action="/admin/b2b-products" scroll={false} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <input type="hidden" name="email" value={email}/>
        <label className="text-xs text-slate-600">Product name<input name="q" defaultValue={q} aria-label="Search B2B products" placeholder="Search product name" className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm"/></label>
        <label className="text-xs text-slate-600">Category<select name="category" defaultValue={category} aria-label="Category" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">All categories</option>{filterChoices.categories.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label>
        <label className="text-xs text-slate-600">Region<select name="region" defaultValue={region} aria-label="Region" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="">All regions</option>{filterChoices.regions.map(name=><option key={name} value={name}>{name}</option>)}</select></label>
        <label className="text-xs text-slate-600">Publication status<select name="status" defaultValue={status} aria-label="Publication status" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="ALL">All statuses</option><option value="ACTIVE">Active</option><option value="INACTIVE">Suspended</option><option value="DRAFT">Draft</option></select></label>
        <label className="text-xs text-slate-600">B2B availability<select name="availability" defaultValue={availability} aria-label="B2B availability" className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-sm"><option value="enabled">Enabled for B2B</option><option value="disabled">Not enabled for B2B</option><option value="all">All products</option></select></label>
        <div className="flex items-end gap-2"><button className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white">Apply filters</button><Link href={b2bCatalogUrl(b2bFilters({email}))} scroll={false} className="rounded-lg border border-slate-300 px-4 py-2.5 text-sm font-semibold">Reset</Link></div>
      </Form>
      {filterChoices.error&&<p role="alert" className="text-sm text-amber-800">Category and region choices could not be loaded. Refresh to try again.</p>}
      <DiscountEditor key={JSON.stringify([customerId,filters,page,!!problem,data.map(p=>[p.id,p.revision,p.businessEnabled])])} products={data} email={customerEmail} customerId={customerId} canEditDiscounts={!problem}/>
      <nav aria-label="Catalog pages" className="flex items-center justify-between text-sm"><span>Page {page} of {Math.max(1,Math.ceil((products.count??0)/size))}</span><div className="flex gap-4">{page>1&&<Link href={url(page-1)}>Previous</Link>}{page*size<(products.count??0)&&<Link href={url(page+1)}>Next</Link>}</div></nav>
    </section>}
  </main>;
}
