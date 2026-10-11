"use server";
import { revalidatePath, updateTag } from "next/cache";
import { requireBusinessAdmin } from "@/lib/business-verification-data";
import { createAdminClient } from "@/lib/supabase/admin";

export type DiscountChange = {productId:string;percent:number;revision:string|null};
export async function saveB2BDiscounts(input:{email:string;customerId:string|null;changes:DiscountChange[]}):Promise<{error?:string;success?:string}> {
  const admin=await requireBusinessAdmin();
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(!input || typeof input.email!=="string" || input.email.length>254 || (input.customerId!==null && !uuid.test(input.customerId)) || !Array.isArray(input.changes) || input.changes.length<1 || input.changes.length>200) return {error:"Select 1 to 200 products and load the customer email if needed."};
  if(input.changes.some(c=>!c || !uuid.test(c.productId) || typeof c.percent!=="number" || !Number.isFinite(c.percent) || c.percent<0 || c.percent>99.99 || Math.abs(c.percent*100-Math.round(c.percent*100))>0.000001 || (c.revision!==null && !uuid.test(c.revision)))) return {error:"Enter a discount from 0 to 99.99 with up to two decimals."};
  const response=await createAdminClient().rpc("save_business_catalog_discounts",{p_admin:admin.id,p_email:input.email.trim(),p_customer:input.customerId,p_changes:input.changes});
  if(response.error){
    const message=response.error.message;
    const known=["Customer email is not registered.","Customer account changed. Load the email again.","Load a registered customer email first.","Discount settings changed. Refresh and try again.","Product is unavailable in the B2B catalog.","Seller-managed listings cannot use these discounts.","Duplicate or missing product."];
    return {error:known.includes(message)?message:"Could not save B2B discounts. Please try again."};
  }
  revalidatePath("/admin/b2b-products");
  revalidatePath("/account/portal/new");
  return {success:`Saved discounts for ${Number(response.data)} selected product${response.data===1?"":"s"}.`};
}


export async function setB2BProductAvailability(productIds:string[],enabled:boolean):Promise<{error?:string;success?:string}> {
  await requireBusinessAdmin();
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if(!Array.isArray(productIds)||productIds.length<1||productIds.length>200||productIds.some(id=>typeof id!=="string"||!uuid.test(id))||typeof enabled!=="boolean") return {error:"Select 1 to 200 valid products."};
  const ids=[...new Set(productIds)],db=createAdminClient();
  const before=await db.from("products").select("id,status,business_enabled,is_preorder_only").in("id",ids);
  if(before.error||before.data?.length!==ids.length) return {error:"Could not verify the selected products. Refresh and try again."};
  if(before.data.some(p=>p.is_preorder_only)) return {error:"Pre-order products cannot be managed in the B2B catalog."};
  const changes=before.data.filter(p=>p.business_enabled!==enabled);
  if(!changes.length)return {success:`Selected products are already ${enabled?"active":"inactive"} in B2B.`};
  // One atomic update changes only this sales channel. Global publication and retail flags remain intact.
  const result=await db.from("products").update({business_enabled:enabled,updated_at:new Date().toISOString()}).in("id",changes.map(p=>p.id)).eq("business_enabled",!enabled).eq("is_preorder_only",false).select("id,status");
  if(result.error||!result.data)return {error:"Could not update B2B availability. Refresh to check the current settings."};
  updateTag("business-catalogue");
  revalidatePath("/admin/b2b-products");
  revalidatePath("/admin/products");
  revalidatePath("/account/portal/new");
  const unpublished=enabled?result.data.filter(p=>p.status!=="ACTIVE").length:0;
  const unchanged=ids.length-result.data.length;
  return {success:`${enabled?"Activated":"Deactivated"} ${result.data.length} selected product${result.data.length===1?"":"s"} in B2B.${unchanged?` ${unchanged} already matched or changed; refresh to check.`:""}${unpublished?` ${unpublished} draft or suspended product${unpublished===1?" still needs":"s still need"} publishing in Products before customers can buy.`:""}`};
}
