import Link from "next/link";
import {randomUUID} from "node:crypto";
import AdminSidebar from "../../AdminSidebar";
import {requireDefinitePlayAdmin} from "@/lib/definiteplay-admin";
import {getDefinitePlayCatalogue,getDefinitePlayItems} from "@/lib/definiteplay-relay";
import {supplierProductVariant,parseSupplierSelection} from "@/lib/definiteplay-import";
import SupplierImportForm from "./SupplierImportForm";

export const dynamic="force-dynamic";
export default async function SupplierImportPage({searchParams}:{searchParams:Promise<{q?:string;category?:string;region?:string;sku?:string;single?:string;variant?:string;skus?:string|string[]}>}) {
  const session=await requireDefinitePlayAdmin();
  const params=await searchParams;
  const value=(key:keyof typeof params)=>typeof params[key]==="string"?params[key]!.slice(0,200):"";
  const q=value("q"),category=value("category"),region=value("region"),sku=value("sku");
  const variant=value("variant")==="regular"||value("variant")==="discounted"?value("variant"):"";
  const explicitSelection = params.skus !== undefined;
  let selectedSkus: string[] = [];
  let selectionError = "";
  if (explicitSelection) {
    try { selectedSkus = parseSupplierSelection(params.skus); }
    catch (error) { selectionError = error instanceof Error ? error.message : "Invalid selection."; }
  }
  const back="/admin/definiteplay?"+new URLSearchParams({q,category,region,variant,...(selectedSkus.length?{selected:selectedSkus.join(",")}: {})});
  const categories=await session.from("categories").select("id,name").eq("is_active",true).order("name");
  let data=null,error="",groupLabel="";
  try {
    if (selectionError) throw new Error(selectionError);
    data=explicitSelection?await getDefinitePlayItems(selectedSkus):sku?await getDefinitePlayItems([sku]):await getDefinitePlayCatalogue(q,0,51,{category,region,variant});
    const returnedSkus = new Set(data.items.map(item => item.sku));
    if (explicitSelection && (data.items.length !== selectedSkus.length || data.total !== selectedSkus.length ||
      selectedSkus.some(selected => !returnedSkus.has(selected)))) {
      throw new Error("Some selected items are no longer in the supplier catalogue. Return to the catalogue and review your selection.");
    }
    if(!explicitSelection && sku && value("single")!=="1" && !data.stale && data.items.length===1) {
      const selected=data.items[0];
      // Derive the group from the authoritative SKU, not the previous search
      // or the URL's category/region, which may describe only one denomination.
      if(selected.brand.trim() && selected.region.trim()) {
        data=await getDefinitePlayCatalogue("",0,51,{category:selected.brand,region:selected.region,variant:supplierProductVariant(selected)});
        groupLabel=selected.brand+" · "+selected.region+" · "+(supplierProductVariant(selected)==="discounted"?"With discount label":"Regular");
      }
    }
    data.items.sort((a,b)=>Number(a.cardValue)-Number(b.cardValue)||a.name.localeCompare(b.name,undefined,{numeric:true}));
    if(data.stale)error="Supplier data is out of date. Refresh the catalogue before importing.";
    else if(!data.total)error="No supplier products match these filters.";
    else if(new Set(data.items.map(supplierProductVariant)).size>1)error="This selection contains regular and discount versions. Choose one version below to keep its denominations in one product.";
    else if(data.total>50)error=sku?"This group has more than 50 options. Narrow the catalogue filters, or import only the chosen denomination below.":"Narrow your category, region or search to 50 items or fewer.";
    else if(new Set(data.items.map(i=>i.brand.trim().toLowerCase()+"|"+i.region.trim().toLowerCase())).size>1)error="Choose one category and region in the catalogue, then import its denominations together.";
    else if(data.items.some(i=>i.currency!=="USD"))error="This import supports supplier costs in USD only.";
  }catch(e){error=e instanceof Error?e.message:"Unable to load supplier products.";}
  if(categories.error)error="Unable to load website categories.";
  return <div className="min-h-screen bg-slate-50 text-slate-900"><div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row"><AdminSidebar/><main className="min-w-0 flex-1 p-5 sm:p-8">
    <Link href={back} className="text-sm font-bold text-blue-600">← Supplier catalogue</Link>
    <h1 className="mt-4 text-3xl font-black">Import supplier product</h1>
    <p className="mt-2 text-slate-600">Create one draft product with the selected supplier items as its options.</p>
    {groupLabel&&<p className="mt-4 rounded-xl bg-blue-50 p-4 text-sm text-blue-900"><strong>{groupLabel}</strong> — denominations from this version are loaded together. Select the denominations you want to save as options under one product.</p>}
    {error?<div className="mt-6 rounded-xl bg-amber-50 p-4 text-amber-900"><p role="alert">{error}</p>
      {!explicitSelection&&!sku&&data&&new Set(data.items.map(supplierProductVariant)).size>1&&<div className="mt-3 flex flex-wrap gap-4">
        <Link className="font-bold text-blue-600" href={"/admin/definiteplay/import?"+new URLSearchParams({q,category,region,variant:"regular"})}>Import regular denominations</Link>
        <Link className="font-bold text-blue-600" href={"/admin/definiteplay/import?"+new URLSearchParams({q,category,region,variant:"discounted"})}>Import denominations with discount label</Link>
      </div>}
      {!explicitSelection&&sku&&data&&data.total>50&&<Link href={"/admin/definiteplay/import?"+new URLSearchParams({sku,single:"1",q,category,region,variant})} className="mt-3 inline-block font-bold text-blue-600">Import only the chosen denomination</Link>}
    </div>:data&&<SupplierImportForm key={data.items.map(i=>i.sku).join(",")} items={data.items} categories={categories.data??[]} requestId={randomUUID()}/>}
  </main></div></div>;
}
