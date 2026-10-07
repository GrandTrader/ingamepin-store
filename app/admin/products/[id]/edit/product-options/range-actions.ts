"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/admin-session";
import {createAdminClient} from "@/lib/supabase/admin";
import {getOpenValueConnection} from "@/lib/definiteplay-open-value-connection";
import {parseRangeMarkup,supplierRangeRate} from "@/lib/range-markup";
import {parseRangeSettings} from "@/lib/product-range";
export async function saveRangeOption(form:FormData){
 const id=String(form.get("id")??""),path=`/admin/products/${id}/edit/product-options`;
 const session=await createClient(),{data:{user}}=await session.auth.getUser();
 if(!user)redirect("/admin/login");
 const access=await session.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();if(!access.data)redirect("/admin/login?error=Access denied");
 let error="";
 try{
 const percentage=form.get("delivery_mode")==="SUPPLIER"&&form.has("markup_percent");
 const input=new FormData();form.forEach((value,key)=>input.set(key,value));
 if(percentage){input.set("price_basis","100");input.set("price_usd","1");}
 const config:ReturnType<typeof parseRangeSettings>&{markup_percent?:number;supplier_discount_percent?:number}=parseRangeSettings(input);
 if(config.delivery_mode==="SUPPLIER"){
   const catalogue=await getOpenValueConnection();
   const item=catalogue.items.find(item=>item.sku===config.supplier_reference);
   if(!item||item.currency!==config.currency||config.minimum<Number(item.minimum)||config.maximum>Number(item.maximum)||Math.abs((config.minimum-Number(item.minimum))/Number(item.increment)-Math.round((config.minimum-Number(item.minimum))/Number(item.increment)))>0.000001||Math.abs(config.step/Number(item.increment)-Math.round(config.step/Number(item.increment)))>0.000001)throw Error("Import a matching supplier range and keep values within its allowed increments.");
   if(percentage){
     if(config.currency!=="USD")throw Error("USD pricing for this currency needs supplier billing verification first.");
     const markup=parseRangeMarkup(String(form.get("markup_percent")??""));
     // Never accept a client-supplied supplier discount or calculated price.
     config.markup_percent=markup;config.supplier_discount_percent=item.discountPercent;
     config.price_basis=100;config.price_usd=supplierRangeRate(item.discountPercent,markup);
   }
   if(config.enabled&&(catalogue.preview||!catalogue.ready||config.currency!=="USD"))throw Error(config.currency!=="USD"?"Foreign-currency supplier billing must be verified before activation. Save this range disabled.":"The updated supplier service is not ready. Save this range disabled until activation.");
 }
 const result=await createAdminClient().rpc(percentage?"save_supplier_range_percentage":"save_product_range",{p_product_id:id,p_admin_id:user.id,p_settings:config});if(result.error)throw Error(result.error.code==="PGRST202"?"Install the range pricing database update first.":result.error.message);}
 catch(e){error=e instanceof Error?e.message:"Unable to save range settings.";}
 if(error)redirect(`${path}?error=${encodeURIComponent(error)}`);
 revalidatePath(path);revalidatePath("/account/portal/new");revalidatePath("/product","layout");revalidatePath("/category","layout");
 redirect(`${path}?success=${encodeURIComponent("Range settings saved.")}`);
}
