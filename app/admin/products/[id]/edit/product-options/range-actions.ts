"use server";
import {redirect} from "next/navigation";
import {revalidatePath} from "next/cache";
import {createClient} from "@/lib/supabase/admin-session";
import {createAdminClient} from "@/lib/supabase/admin";
import {parseRangeSettings} from "@/lib/product-range";
export async function saveRangeOption(form:FormData){
 const id=String(form.get("id")??""),path=`/admin/products/${id}/edit/product-options`;
 const session=await createClient(),{data:{user}}=await session.auth.getUser();
 if(!user)redirect("/admin/login");
 const access=await session.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();if(!access.data)redirect("/admin/login?error=Access denied");
 let error="";
 try{const config=parseRangeSettings(form);const result=await createAdminClient().rpc("save_product_range",{p_product_id:id,p_admin_id:user.id,p_settings:config});if(result.error)throw Error(result.error.code==="PGRST202"?"Install the range database update first.":result.error.message);}
 catch(e){error=e instanceof Error?e.message:"Unable to save range settings.";}
 if(error)redirect(`${path}?error=${encodeURIComponent(error)}`);
 revalidatePath(path);revalidatePath("/account/portal/new");revalidatePath("/product","layout");revalidatePath("/category","layout");
 redirect(`${path}?success=${encodeURIComponent("Range settings saved.")}`);
}
