import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import RegionFilterSelect from "./RegionFilterSelect";
import { portalCustomer, catalogueRegions } from "@/lib/business-portal-data";
import { portalPage, type PortalProduct } from "@/lib/business-portal";
import { createAdminClient } from "@/lib/supabase/admin";
import ProductTable from "./ProductTable";
import { Pagination } from "../Shared";
import s from "../Portal.module.css";
type Filters={q?:string;region?:string;category?:string;page?:string;popular?:string};
export default async function NewBusinessOrder({searchParams}:{searchParams:Promise<Filters>}) {
  const {user,session}=await portalCustomer(), filters=await searchParams, page=portalPage(filters.page);
  const productRegions=await catalogueRegions();
  const selectedRegion=filters.region&&productRegions.includes(filters.region)?filters.region:"";
  // Filter brands across the entire regional catalogue, not just the current product page.
  const categories=await (selectedRegion
    ? session.from("categories").select("id,name,image_url,products!inner(id)")
        .eq("is_active",true).eq("products.status","ACTIVE").eq("products.is_preorder_only",false)
        .eq("products.region",selectedRegion).limit(1,{referencedTable:"products"}).order("sort_order")
    : session.from("categories").select("id,name,image_url").eq("is_active",true).order("sort_order"));
  if(categories.error)throw Error("Unable to load brands for this region. Please try again.");
  if(filters.category&&!categories.data.some(category=>category.id===filters.category)) {
    const params=new URLSearchParams();
    for(const [key,value] of Object.entries(filters))if(value&&key!=="category"&&key!=="page")params.set(key,value);
    redirect("/account/portal/new?"+params);
  }
  let query=session.from("products").select("id,name,slug,image_url,region,currency,is_bulk_order,delivery_type,product_type,minimum_quantity,maximum_quantity,stock_quantity,allows_player_id_topup,sold_count,categories(name,slug),product_customer_fields(id),product_options(id,option_name,denomination,selling_price,minimum_quantity,maximum_quantity,is_custom_value,is_active,is_in_stock,stock_quantity)",{count:"exact"}).eq("status","ACTIVE").eq("is_preorder_only",false);
  if(filters.q?.trim()) query=query.ilike("name","%"+filters.q.trim().slice(0,100).replace(/[\\%_]/g,"\\$&")+"%");
  if(selectedRegion)query=query.eq("region",selectedRegion);
  if(filters.category&&/^[a-f0-9-]{36}$/i.test(filters.category))query=query.eq("category_id",filters.category);
  const [products,discounts]=await Promise.all([
    query.order(filters.popular==="yes"?"sold_count":"sort_order",{ascending:filters.popular!=="yes"}).order("id").range((page-1)*20,page*20-1),
    createAdminClient().from("customer_product_discounts").select("product_id,discount_percent").eq("user_id",user.id).eq("is_active",true),
  ]);
  if(products.error||categories.error||discounts.error)throw Error("Unable to load the business catalogue. Please try again.");
  const regionFlags: Record<string,string>={"United States":"us","United States of America":"us","USA":"us","US":"us","United Kingdom":"gb","UK":"gb","India":"in","Canada":"ca","Australia":"au","Germany":"de","France":"fr","Japan":"jp","Saudi Arabia":"sa","United Arab Emirates":"ae","UAE":"ae","Turkey":"tr","Türkiye":"tr","European Union":"eu","Europe":"eu","EU":"eu","Hong Kong":"hk","Italy":"it","Spain":"es","Singapore":"sg"};
  const url=(changes:Filters)=>{const p=new URLSearchParams();for(const [k,v]of Object.entries({...filters,...changes,page:undefined}))if(v)p.set(k,v);return "/account/portal/new?"+p;};
  return <><div className={s.titleLine}><h2>New order</h2><Link className={s.button} href="/cart">Open cart ↗</Link></div><ProductTable userId={user.id} products={products.data as unknown as PortalProduct[]} discounts={Object.fromEntries(discounts.data.map(d=>[d.product_id,Number(d.discount_percent)]))} filters={<><div className={s.filterGroup}><Link href={url({popular:""})} aria-current={filters.popular!=="yes"}>All products</Link><Link href={url({popular:"yes"})} aria-current={filters.popular==="yes"}>Popular products</Link></div><section className={s.card} style={{marginBottom:16}}><p className={s.eyebrow}>Region</p><div className={s.filterGroup}><Link href={url({region:""})} aria-current={!filters.region}>All regions</Link>{productRegions.slice(0,18).map(region=><Link key={region} href={url({region})} aria-current={filters.region===region}>{regionFlags[region]&&<Image className={s.flag} src={`/images/business-flags/${regionFlags[region]}.svg`} alt="" width={40} height={30}/>}<span>{region}</span></Link>)}</div><p className={s.eyebrow}>Brand / category</p><div className={s.filterGroup}><Link href={url({category:""})} aria-current={!filters.category}>All brands</Link>{categories.data.slice(0,16).map(c=><Link key={c.id} href={url({category:c.id})} aria-current={filters.category===c.id}>{c.image_url&&<Image className={s.brand} src={c.image_url} alt="" width={52} height={34} unoptimized/>}<span>{c.name}</span></Link>)}</div></section><form key={`${selectedRegion}:${filters.category??""}`} className={s.toolbar}><label className={s.search}>Search products<input name="q" defaultValue={filters.q} placeholder="Search brand or product name"/></label><label>Region<RegionFilterSelect regions={productRegions} value={selectedRegion}/></label><label>Brand / category<select name="category" defaultValue={filters.category??""}><option value="">All brands</option>{categories.data.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label>{filters.popular&&<input type="hidden" name="popular" value={filters.popular}/>}<button className={s.button}>Search</button><Link href="/account/portal/new" className={s.button}>Reset</Link></form></>}/><Pagination page={page} count={products.count??0} base="/account/portal/new" params={filters}/></>;
}
