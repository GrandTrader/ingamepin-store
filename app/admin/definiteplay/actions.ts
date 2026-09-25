"use server";
import { revalidatePath } from "next/cache";
import { requireDefinitePlayAdmin, validProductId } from "@/lib/definiteplay-admin";
import { definitePlayRequest, getDefinitePlayCatalogue } from "@/lib/definiteplay-relay";
import { supplierProductIds } from "@/lib/definiteplay-fulfillment";
import type { DefinitePlayItem } from "@/lib/definiteplay-types";

export async function refreshDefinitePlay(): Promise<{error?: string; success?: boolean}> {
  await requireDefinitePlayAdmin();
  try {
    const result=await definitePlayRequest<{accepted:boolean;retryAfter?:number}>("refresh",{method:"POST"});
    if (!result.accepted) return {error:`Supplier data was just checked. Try again in ${result.retryAfter??30} seconds.`};
    revalidatePath("/admin/definiteplay");
    return {success:true};
  } catch(error) { return {error:error instanceof Error ? error.message : "Refresh failed."}; }
}
export async function searchDefinitePlay(query: string): Promise<{items:DefinitePlayItem[]; stale?:boolean; error?:string}> {
  await requireDefinitePlayAdmin();
  if (typeof query !== "string" || query.trim().length < 2) return {items:[]};
  try {
    const result=await getDefinitePlayCatalogue(query.trim(),0,15);
    return {items:result.items,stale:result.stale};
  } catch(error) { return {items:[],error:error instanceof Error ? error.message : "Search failed."}; }
}
export async function saveDefinitePlayMapping(productId:string,optionId:string,sku:string|null):Promise<{error?:string;success?:boolean}> {
  const session=await requireDefinitePlayAdmin();
  if (!validProductId(productId) || !validProductId(optionId) ||
      (sku !== null && (typeof sku !== "string" || !/^[A-Za-z0-9._-]{1,100}$/.test(sku)))) {
    return {error:"Choose a valid product and option."};
  }
  const option=await session.from("product_options").select("id,product_id").eq("id",optionId).eq("product_id",productId).maybeSingle();
  if (option.error || !option.data) return {error:"This product option could not be found."};
  try {
    if ((await supplierProductIds([productId])).has(productId)) return {error:"Switch to uploaded stock before changing supplier links. Existing supplier orders must be resolved first."};
    await definitePlayRequest("mapping",{
      method:sku === null ? "DELETE" : "PUT",body:{productId,optionId,...(sku === null ? {} : {sku})},
    });
    revalidatePath(`/admin/products/${productId}/edit/supplier`);
    return {success:true};
  } catch(error) { return {error:error instanceof Error ? error.message : "Unable to save the link."}; }
}
