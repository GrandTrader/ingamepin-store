"use server";
import {revalidatePath} from "next/cache";
import {requireDefinitePlayAdmin} from "@/lib/definiteplay-admin";
import {createAdminClient} from "@/lib/supabase/admin";

export async function createSupplierImportCategory(name:string,categoryType:string):Promise<{category?:{id:string;name:string};error?:string}> {
  await requireDefinitePlayAdmin();
  if(typeof name!=="string"||name.trim().length<2||name.trim().length>100) return {error:"Category name must contain 2–100 characters."};
  if(!["GIFT_CARD","SUBSCRIPTION","GAME_KEY","GAME_TOPUP","DIGITAL_PRODUCT"].includes(categoryType))return {error:"Choose a valid category type."};
  const cleanName=name.trim();
  const slug=cleanName.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"");
  if(!slug)return {error:"Include English letters or numbers in the category name."};
  const admin=createAdminClient();
  const lookup=()=>admin.from("categories").select("id,name,is_active,category_type").eq("slug",slug).maybeSingle();
  const reuse=(row:{id:string;name:string;is_active:boolean;category_type:string})=>{
    if(!row.is_active)return {error:"This category already exists but is inactive. Activate it under Catalog → Categories."};
    if(row.category_type!==categoryType)return {error:"This category already exists with another type. Select it from the list or use a different name."};
    return {category:{id:row.id,name:row.name}};
  };
  try {
    const existing=await lookup();
    if(existing.error)return {error:"Unable to check categories. Please try again."};
    if(existing.data)return reuse(existing.data);
    const created=await admin.from("categories").insert({
      name:cleanName,slug,category_type:categoryType,is_active:true,sort_order:0,
      description:null,image_url:null,
    }).select("id,name").single();
    if(created.error){
      if(created.error.code==="23505"){
        const duplicate=await lookup();
        if(!duplicate.error&&duplicate.data)return reuse(duplicate.data);
      }
      return {error:"Unable to confirm category creation. Retry with the same name to check it."};
    }
    if(!created.data)return {error:"Unable to confirm category creation. Retry with the same name."};
    revalidatePath("/admin/categories");
    revalidatePath("/admin/products/new");
    revalidatePath("/admin/products/import");
    revalidatePath("/");
    return {category:created.data};
  }catch{return {error:"Unable to confirm category creation. Retry with the same name to check it."};}
}
