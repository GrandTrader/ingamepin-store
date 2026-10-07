import "server-only";
import { createAdminClient } from "./supabase/admin";
import type { RangeMarkup } from "./range-markup";
import type { ProductRange } from "./product-range";
export async function productRanges(ids:string[]):Promise<{ready:boolean;ranges:ProductRange[]}>{
  if(!ids.length)return {ready:true,ranges:[]};
  const columns="product_id,option_id,enabled,currency,minimum,maximum,step,price_basis,price_usd,delivery_mode,supplier,supplier_reference";
  let result=await createAdminClient().from("product_range_settings").select(columns+",price_rounding").in("product_id",ids).returns<ProductRange[]>();
  if(result.error&&["42703","PGRST204"].includes(result.error.code))result=await createAdminClient().from("product_range_settings").select(columns).in("product_id",ids).returns<ProductRange[]>();
  if(result.error){if(["42P01","PGRST205"].includes(result.error.code))return {ready:false,ranges:[]};throw Error("Unable to load denomination ranges.");}
  return {ready:true,ranges:result.data??[]};
}

// Call only from the authenticated admin editor. Costs/markups never enter public range data.
export async function rangeMarkupForAdmin(productId:string):Promise<RangeMarkup|null>{
 const result=await createAdminClient().from("product_range_settings").select("supplier_markup_percent,supplier_discount_percent").eq("product_id",productId).maybeSingle();
 if(result.error&&["42703","PGRST204","42P01","PGRST205"].includes(result.error.code))return null;
 if(result.error)throw Error("Unable to load range pricing.");
 if(result.data?.supplier_markup_percent==null||result.data?.supplier_discount_percent==null)return null;
 return {markup:Number(result.data.supplier_markup_percent),discount:Number(result.data.supplier_discount_percent)};
}
