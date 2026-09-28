import "server-only";
import { createAdminClient } from "./supabase/admin";
import type { ProductRange } from "./product-range";
export async function productRanges(ids:string[]):Promise<{ready:boolean;ranges:ProductRange[]}>{
  if(!ids.length)return {ready:true,ranges:[]};
  const result=await createAdminClient().from("product_range_settings").select("product_id,option_id,enabled,currency,minimum,maximum,step,price_basis,price_usd,delivery_mode,supplier,supplier_reference").in("product_id",ids);
  if(result.error){if(["42P01","PGRST205"].includes(result.error.code))return {ready:false,ranges:[]};throw Error("Unable to load denomination ranges.");}
  return {ready:true,ranges:result.data as ProductRange[]};
}
