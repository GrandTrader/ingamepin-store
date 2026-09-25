"use server";
import {randomUUID} from "node:crypto";
import {revalidatePath} from "next/cache";
import {requireDefinitePlayAdmin,validProductId} from "@/lib/definiteplay-admin";
import {createAdminClient} from "@/lib/supabase/admin";
import {getDefinitePlayItems,definitePlayRequest} from "@/lib/definiteplay-relay";
import {prepareSupplierDraft,type SupplierImportInput} from "@/lib/definiteplay-import";
import {UNLIMITED_STOCK_QUANTITY} from "@/lib/product-stock";

export async function importSupplierProduct(input:SupplierImportInput):Promise<{error?:string;productId?:string;warning?:string}> {
  const session=await requireDefinitePlayAdmin();
  if(!input || typeof input.requestId!=="string" || !validProductId(input.requestId) || typeof input.categoryId!=="string" || !validProductId(input.categoryId))return {error:"Choose a valid website category."};
  const productId=input.requestId.toLowerCase();
  const slug="definiteplay-"+productId;
  const admin=createAdminClient();
  const existing=await admin.from("products").select("id,slug").eq("id",productId).maybeSingle();
  if(existing.error)return {error:"Unable to check previous imports. Try again."};
  if(existing.data) return existing.data.slug===slug
    ? {productId,warning:"This draft was already created. Review its options and supplier links before publishing."}
    : {error:"This import reference is already in use. Reload the import page."};
  const category=await session.from("categories").select("id,category_type").eq("id",input.categoryId).eq("is_active",true).maybeSingle();
  if(category.error||!category.data||!["GAME_TOPUP","GAME_KEY","GIFT_CARD","SUBSCRIPTION","DIGITAL_PRODUCT"].includes(category.data.category_type))return {error:"Choose an active website category."};
  let draft;
  try{
    if(!Array.isArray(input.options)||!input.options.length||input.options.length>50)throw new Error("Select between 1 and 50 items.");
    const stock=await getDefinitePlayItems(input.options.map(o=>o.sku));
    if(stock.stale)throw new Error("Supplier data is out of date. Refresh the catalogue first.");
    draft=prepareSupplierDraft(input,stock.items);
  }catch(e){return {error:e instanceof Error?e.message:"Unable to check supplier prices."};}
  const options=draft.options.map((o,index)=>({
    id:randomUUID(),product_id:productId,category_id:input.categoryId,option_type:"CURRENCY",
    option_name:o.name,denomination:o.denomination,denomination_currency:o.currency,
    selling_price:o.price,stock_quantity:0,is_active:true,is_in_stock:false,is_custom_value:false,sort_order:index,
  }));
  const created=await admin.from("products").insert({
    id:productId,slug,category_id:input.categoryId,name:draft.title,name_ru:draft.titleRu||null,
    description:draft.description||null,description_ru:draft.descriptionRu||null,
    region:draft.region,product_type:category.data.category_type,delivery_type:"MANUAL",is_bulk_order:false,
    currency:"USD",price:Math.min(...draft.options.map(o=>o.price)),stock_quantity:0,status:"DRAFT",is_featured:false,
    allows_fixed_values:true,allows_custom_value:false,allows_player_id_topup:false,allows_gaming_voucher:true,
    minimum_quantity:1,maximum_quantity:UNLIMITED_STOCK_QUANTITY,sold_count:0,
  });
  if(created.error) {
    return {error:"Draft creation could not be confirmed. Retry with this page to check the same import, or review your product list."};
  }
  let warning="";
  try {
    const saved=await admin.from("product_options").insert(options);
    if(saved.error)throw new Error("options");
    // Keep the draft if any link fails. Retrying the same import cannot create another product.
    for(let i=0;i<options.length;i++){
      await definitePlayRequest("mapping",{method:"PUT",body:{productId,optionId:options[i].id,sku:draft.options[i].sku}});
    }
  }catch {
    warning="Draft created, but some options or supplier links could not be confirmed. Review Product options and Supplier before publishing.";
  }
  revalidatePath("/admin/products");
  return {productId,...(warning?{warning}:{})};
}
