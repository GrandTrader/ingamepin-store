"use server";
import {redirect} from "next/navigation";
import {revalidatePath, updateTag} from "next/cache";
import {createClient} from "@/lib/supabase/admin-session";
import {createAdminClient} from "@/lib/supabase/admin";
import {getOpenValueConnection} from "@/lib/definiteplay-open-value-connection";
import {parseRangeMarkup,supplierRangeRate} from "@/lib/range-markup";
import {parseRangeSettings} from "@/lib/product-range";
import {markedUpRate} from "@/lib/linked-range-pricing";
export async function saveRangeOption(form:FormData){
 const id=String(form.get("id")??""),path=`/admin/products/${id}/edit/product-options`;
 const session=await createClient(),{data:{user}}=await session.auth.getUser();
 if(!user)redirect("/admin/login");
 const access=await session.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();if(!access.data)redirect("/admin/login?error=Access denied");
 let error="";
 try{
 const linked=form.get("link_fixed_prices")==="on";
 const percentage=form.get("delivery_mode")==="SUPPLIER"&&form.has("markup_percent");
 const input=new FormData();form.forEach((value,key)=>input.set(key,value));
 if(percentage){input.set("price_basis","100");input.set("price_usd","1");}
 if(linked&&form.get("delivery_mode")==="MANUAL")input.set("price_usd","1");
 const config:ReturnType<typeof parseRangeSettings>&{markup_percent?:number;supplier_discount_percent?:number;base_price_usd?:number}=parseRangeSettings(input);
 if(linked){
  config.markup_percent=parseRangeMarkup(String(form.get("markup_percent")??""));
  if(config.delivery_mode==="MANUAL"){
   const raw=String(form.get("base_price_usd")??"");
   if(!/^\d+(?:\.\d{1,10})?$/.test(raw))throw Error("Enter a positive base price.");
   config.base_price_usd=Number(raw);config.price_usd=markedUpRate(config.base_price_usd,config.markup_percent);
   if(config.price_usd>1000000)throw Error("Enter a valid base price.");
  }
 }
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
 const result=await createAdminClient().rpc(linked?"save_linked_product_range":percentage?"save_supplier_range_percentage":"save_product_range",{p_product_id:id,p_admin_id:user.id,p_settings:config});if(result.error)throw Error(result.error.code==="PGRST202"?"Install the range pricing database update first.":result.error.message);}
 catch(e){error=e instanceof Error?e.message:"Unable to save range settings.";}
 if(error)redirect(`${path}?error=${encodeURIComponent(error)}`);
 updateTag("homepage-store-data"); revalidatePath(path);revalidatePath("/account/portal/new");revalidatePath("/product","layout");revalidatePath("/category","layout");
 redirect(`${path}?success=${encodeURIComponent(form.get("link_fixed_prices")==="on"?"Range and denomination pricing saved together.":"Range settings saved.")}`);
}
