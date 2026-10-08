import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { privateJson, sameOrigin, requestLimit } from "@/lib/request-security";
import { productPromotions } from "@/lib/product-promotion-data";
import { productRanges } from "@/lib/product-range-data";
import { rangePrice } from "@/lib/product-range";
import { activePromotion, discountedPrice } from "@/lib/product-promotions";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest){
 if(!sameOrigin(request))return privateJson({error:"Invalid request origin."},403);
 try{
  const limited=await requestLimit(request,"product-prices",120,60);if(limited)return limited;
  const text=await request.text();if(text.length>25000)return privateJson({error:"Cart is too large."},400);
  const body=JSON.parse(text), items=body.items as Array<{productOptionId:string;customValue?:number}>;
  if(!Array.isArray(items)||!items.length||items.length>100||items.some(i=>!i||!/^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i.test(i.productOptionId)))return privateJson({error:"Select valid product options."},400);
  const db=createAdminClient();
  const options=await db.from("product_options").select("id,product_id,selling_price,is_custom_value,products!inner(id,status,retail_enabled,business_enabled,allows_custom_value,minimum_custom_value,maximum_custom_value,affiliate_enabled,affiliate_commission_percent)").in("id",[...new Set(items.map(i=>i.productOptionId))]).eq("is_active",true).eq("products.status","ACTIVE");
  if(options.error)throw Error("Unable to load prices.");
  const ids=[...new Set(options.data.map(o=>o.product_id))];
  const [promotions,ranges]=await Promise.all([productPromotions(ids),productRanges(ids)]);
  let affiliateProduct:string|null=null, affiliatePercent=0;
  const clickId=request.cookies.get("igp_affiliate_click")?.value, token=request.cookies.get("igp_affiliate_visitor")?.value;
  const secret=process.env.AFFILIATE_HASH_SECRET??process.env.SUPABASE_SECRET_KEY??"";
  if(clickId&&token&&secret&&/^[0-9a-f-]{36}$/i.test(clickId)){
   const hash=createHash("sha256").update(secret+":"+token).digest("hex");
   const click=await db.from("affiliate_clicks").select("affiliate_id,product_id,created_at").eq("id",clickId).eq("visitor_token_hash",hash).maybeSingle();
   const settings=await db.from("affiliate_settings").select("program_enabled,cookie_days").eq("id",1).maybeSingle();
   if(click.error||settings.error)throw Error("Unable to verify affiliate pricing.");
   if(click.data&&settings.data?.program_enabled&&Date.parse(click.data.created_at)>Date.now()-Number(settings.data.cookie_days)*86400000){
    const [account,rate]=await Promise.all([db.from("affiliate_accounts").select("commission_override_percent").eq("id",click.data.affiliate_id).eq("status","APPROVED").maybeSingle(),db.from("affiliate_product_rates").select("commission_percent").eq("affiliate_id",click.data.affiliate_id).eq("product_id",click.data.product_id).maybeSingle()]);
    if(account.error||rate.error)throw Error("Unable to verify affiliate pricing.");
    const option=options.data.find(o=>o.product_id===click.data!.product_id);
    const p=option?(Array.isArray(option.products)?option.products[0]:option.products):null;
    if(account.data&&p?.affiliate_enabled){affiliateProduct=p.id;affiliatePercent=Math.max(0,Math.min(Number(rate.data?.commission_percent??account.data.commission_override_percent??p.affiliate_commission_percent),Number(account.data.commission_override_percent??p.affiliate_commission_percent)));}
   }
  }
  const prices=items.map((item,index)=>{
   const option=options.data.find(o=>o.id===item.productOptionId);if(!option)throw Error("A product option is unavailable.");
   const p=Array.isArray(option.products)?option.products[0]:option.products;
   if(!p||(!p.retail_enabled&&!p.business_enabled))throw Error("A product is unavailable.");
   const range=ranges.ranges.find(r=>r.option_id===option.id);
   let regular=Number(option.selling_price);
   if(range)regular=rangePrice(range,Number(item.customValue));
   else if(item.customValue!==undefined){
    if(!option.is_custom_value||!p.allows_custom_value||!Number.isFinite(item.customValue)||item.customValue<=0||item.customValue<Number(p.minimum_custom_value??0)||(p.maximum_custom_value!=null&&item.customValue>Number(p.maximum_custom_value)))throw Error("Invalid custom denomination.");
    regular=item.customValue;
   }else if(option.is_custom_value)throw Error("Enter a custom denomination.");
   const sale=activePromotion(promotions.rows.find(row=>row.product_id===option.product_id)?.rules,option.id);
   const expectedSaleUnitPrice=discountedPrice(regular,sale?.percent??0);
   const markup=affiliateProduct===p.id?affiliatePercent:0;
   const marked=(price:number)=>Math.round((price+Math.round(price*markup)/100)*100)/100;
   return {index,productOptionId:option.id,price:marked(expectedSaleUnitPrice),regularPrice:marked(regular),salePercent:sale?.percent??0,saleEndsAt:sale?.endsAt??null,expectedSaleUnitPrice};
  });
  return privateJson({prices});
 }catch(e){return privateJson({error:e instanceof Error?e.message:"Unable to refresh prices."},400);}
}
