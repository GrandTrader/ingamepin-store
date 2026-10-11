import { productPromotions } from "@/lib/product-promotion-data";
import { productRanges } from "@/lib/product-range-data";
import Link from "next/link";
import { portalCustomer } from "@/lib/business-portal-data";
import { businessCatalogDiscounts } from "@/lib/business-catalog-discounts";
import Catalogue, { type CatalogueProduct, type CatalogueFilters } from "./Catalogue";
import s from "../Portal.module.css";

export default async function NewBusinessOrder({searchParams}:{searchParams:Promise<CatalogueFilters>}) {
  const {user,session}=await portalCustomer();
  // Load the complete authorised catalogue once. Filter clicks stay entirely in the browser.
  const catalogue=async()=>{
    const rows:CatalogueProduct[]=[];
    for(let from=0;;from+=500){
      const result=await session.from("products").select("id,name,slug,image_url,region,category_id,currency,is_bulk_order,delivery_type,product_type,minimum_quantity,maximum_quantity,stock_quantity,allows_player_id_topup,sold_count,categories(name,slug),product_customer_fields(id),product_options(id,option_name,denomination,denomination_currency,selling_price,minimum_quantity,maximum_quantity,is_custom_value,is_active,is_in_stock,stock_quantity)").eq("status","ACTIVE").eq("business_enabled", true).eq("is_preorder_only",false).order("sort_order").order("id").range(from,from+499);
      if(result.error)throw Error("Unable to load the business catalogue. Please try again.");
      rows.push(...result.data as unknown as CatalogueProduct[]);
      if(result.data.length<500)return rows;
    }
  };
  const [products,categories,filters]=await Promise.all([
    catalogue(),
    session.from("categories").select("id,name,image_url").eq("is_active",true).order("sort_order"),
    searchParams,
  ]);
  if(categories.error)throw Error("Unable to load the business catalogue. Please try again.");
  const ids=products.map(p=>p.id);
  const [ranges,promotions,discounts]=await Promise.all([productRanges(ids),productPromotions(ids),businessCatalogDiscounts(user.id,ids)]);
  for(const p of products)p.promotionRules=promotions.rows.find(r=>r.product_id===p.id)?.rules??[];
  return <><div className={s.titleLine}><h2>New order</h2><Link className={s.button} href="/account/portal">Order history</Link></div><Catalogue ranges={ranges.ranges.filter(r=>r.enabled)} userId={user.id} products={products} categories={categories.data} discounts={discounts} initialFilters={filters}/></>;
}
