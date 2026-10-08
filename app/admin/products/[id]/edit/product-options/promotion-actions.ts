"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { parsePromotionRules } from "@/lib/product-promotions";
export async function saveProductPromotions(form: FormData) {
 const id=String(form.get("id")??""), path=`/admin/products/${id}/edit/product-options`;
 const session=await createClient({reuseVerifiedUser:true});
 const {data:{user}}=await session.auth.getUser();
 if(!user)redirect("/admin/login");
 const access=await session.from("admin_users").select("user_id").eq("user_id",user.id).maybeSingle();
 if(!access.data)redirect("/admin/login?error=Access denied");
 let rules;
 try{rules=parsePromotionRules(JSON.parse(String(form.get("rules")??"[]")));}
 catch(e){redirect(path+"?error="+encodeURIComponent(e instanceof Error?e.message:"Invalid discounts."));}
 const result=await createAdminClient().rpc("save_product_promotions",{p_product:id,p_admin:user.id,p_revision:String(form.get("revision")??"")||null,p_rules:rules});
 if(result.error)redirect(path+"?error="+encodeURIComponent(["42883","PGRST202"].includes(result.error.code)?"Install the discount database update first.":result.error.message));
 revalidatePath("/", "layout");
 redirect(path+"?success="+encodeURIComponent("Discounts saved. They end automatically at the selected India time."));
}
