import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { authorizeBusinessApi, businessApiJson } from "@/lib/business-api-auth";
import { apiPage } from "@/lib/business-api-input";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAllDeliveredCodes } from "@/lib/delivered-codes";
import { productRanges } from "@/lib/product-range-data";
import { handleOrder } from "@/lib/order-request-handler";
import { POST as quantityLimits } from "@/app/api/products/quantity-limits/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ path: string[] }> };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest, context: Context) {
  const auth = await authorizeBusinessApi(request);
  if (auth.error) return auth.error;
  const { user } = auth.principal;
  const { path } = await context.params;
  const db = createAdminClient();
  try {
    if (path.length === 1 && path[0] === "wallet") {
      const wallet = await db.from("customer_wallets").select("balance,currency").eq("user_id",user.id).maybeSingle();
      if (wallet.error) throw Error("Wallet unavailable.");
      return businessApiJson({ balance: Number(wallet.data?.balance ?? 0), currency: wallet.data?.currency ?? "USD", paymentsEnabled: user.app_metadata?.wallet_disabled !== true });
    }
    if (path.length === 1 && path[0] === "products") {
      let page: number;
      try { page = apiPage(request.nextUrl.searchParams.get("page")); } catch { return businessApiJson({error:"Invalid page."},400); }
      let query = db.from("products").select("id,name,region,currency,image_url,delivery_type,minimum_quantity,maximum_quantity,is_bulk_order,product_type,allows_player_id_topup,product_customer_fields(id,label,placeholder,field_type,is_required,sort_order),product_options(id,option_name,denomination,denomination_currency,selling_price,is_active,is_in_stock,is_custom_value,minimum_quantity,maximum_quantity)",{count:"exact"}).eq("status","ACTIVE").eq("business_enabled",true).eq("is_preorder_only",false);
      const region = request.nextUrl.searchParams.get("region");
      if (region) query = query.eq("region",region.slice(0,100));
      const [products,discounts] = await Promise.all([
        query.order("id").range((page-1)*20,page*20-1),
        db.from("customer_product_discounts").select("product_id,discount_percent").eq("user_id",user.id).eq("is_active",true),
      ]);
      if (products.error || discounts.error) throw Error("Catalogue unavailable.");
      const ranges = await productRanges(products.data.map(p=>p.id));
      if (!ranges.ready) throw Error("Product ranges unavailable.");
      const data = products.data.map(product=>{
        const { product_options, product_customer_fields, ...details } = product;
        const discountPercent = Math.max(0,Math.min(100,Number(discounts.data.find(d=>d.product_id===product.id)?.discount_percent ?? 0)));
        return { ...details, customerFields:product_customer_fields.slice().sort((a,b)=>a.sort_order-b.sort_order), requiresDeliveryDetails: product_customer_fields.length>0 || product.allows_player_id_topup || product.product_type==="GAME_TOPUP", priceCurrency:"USD", discountPercent,
          options:product_options.filter(o=>o.is_active).map(option=>({ ...option, unitPrice:Number(option.selling_price), range:ranges.ranges.find(r=>r.enabled&&r.option_id===option.id) ? (()=>{const r=ranges.ranges.find(r=>r.enabled&&r.option_id===option.id)!;return {currency:r.currency,minimum:r.minimum,maximum:r.maximum,step:r.step,priceBasis:r.price_basis,priceUsd:r.price_usd};})() : null })),
        };
      });
      return businessApiJson({data,page,pageSize:20,total:products.count,nextPage:page*20<(products.count??0)?page+1:null});
    }
    if (path.length === 1 && path[0] === "stock") {
      const ids = [...new Set((request.nextUrl.searchParams.get("optionIds")??"").split(",").filter(Boolean))];
      if (!ids.length || ids.length>100 || ids.some(id=>!uuid.test(id))) return businessApiJson({error:"Provide 1–100 comma-separated optionIds."},400);
      const options = await db.from("product_options").select("id,product_id,products!inner(status,business_enabled,is_preorder_only)").in("id",ids).eq("is_active",true).eq("products.status","ACTIVE").eq("products.business_enabled",true).eq("products.is_preorder_only",false);
      if (options.error) throw Error("Stock unavailable.");
      if (options.data.length!==ids.length) return businessApiJson({error:"One or more options are unavailable in the business catalogue."},404);
      const result = await quantityLimits(new NextRequest(new URL("/api/products/quantity-limits",request.url),{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({items:options.data.map(o=>({productId:o.product_id,productOptionId:o.id}))})}));
      result.headers.set("Cache-Control","private, no-store");
      return result;
    }
    if (path[0] === "orders" && path.length === 1) {
      let page: number;
      try { page = apiPage(request.nextUrl.searchParams.get("page")); } catch { return businessApiJson({error:"Invalid page."},400); }
      const orders = await db.from("orders").select("id,order_number,status,total,currency,created_at",{count:"exact"}).eq("customer_id",user.id).eq("sales_channel","BUSINESS").order("created_at",{ascending:false}).order("id").range((page-1)*20,page*20-1);
      if (orders.error) throw Error("Orders unavailable.");
      return businessApiJson({data:orders.data,page,pageSize:20,total:orders.count,nextPage:page*20<(orders.count??0)?page+1:null});
    }
    if (path[0] === "orders" && (path.length === 2 || (path.length === 3 && path[2] === "codes"))) {
      if (!uuid.test(path[1])) return businessApiJson({error:"Order not found."},404);
      const order = await db.from("orders").select("id,order_number,status,total,currency,created_at,order_items(id,product_id,product_option_id,product_name,option_name,quantity,total_price)").eq("id",path[1]).eq("customer_id",user.id).eq("sales_channel","BUSINESS").maybeSingle();
      if (order.error) throw Error("Order unavailable.");
      if (!order.data) return businessApiJson({error:"Order not found."},404);
      if (path.length===2) return businessApiJson({data:order.data});
      if (!["PAID","PROCESSING","DELIVERED"].includes(order.data.status)) return businessApiJson({error:"Codes are unavailable for this order status."},409);
      const codes = await getAllDeliveredCodes(order.data.order_items.map(i=>i.id));
      return businessApiJson({orderId:order.data.id,status:order.data.status,items:order.data.order_items.map(item=>({orderItemId:item.id,productName:item.product_name,optionName:item.option_name,quantity:item.quantity,codes:codes.filter(c=>c.order_item_id===item.id).map(c=>c.code)}))});
    }
    return businessApiJson({error:"Endpoint not found."},404);
  } catch { return businessApiJson({error:"Unable to load business data. Try again shortly."},503); }
}

export async function POST(request: NextRequest, context: Context) {
  const { path } = await context.params;
  const quote = path.length===2 && path[0]==="orders" && path[1]==="quote";
  if (!quote && !(path.length===1 && path[0]==="orders")) return businessApiJson({error:"Endpoint not found."},404);
  const auth = await authorizeBusinessApi(request,!quote);
  if (auth.error) return auth.error;
  const requestId = request.headers.get("idempotency-key") ?? (quote ? randomUUID() : "");
  if (!uuid.test(requestId)) return businessApiJson({error:"Provide a UUID Idempotency-Key header. Reuse it for retries of the same order."},400);
  let body;
  try {
    const raw = await request.text();
    if (raw.length>150000) return businessApiJson({error:"Request body is too large."},413);
    body = JSON.parse(raw);
    if (!body || typeof body!=="object" || Array.isArray(body)) throw Error("Invalid body");
  } catch { return businessApiJson({error:"Send a valid JSON object."},400); }
  const forwarded = new NextRequest(new URL("/api/account/portal/orders",request.url),{
    method:"POST",headers:{"Content-Type":"application/json","cf-connecting-ip":auth.principal.ip},
    body:JSON.stringify({action:quote?"quote":"confirm",paymentMethod:"wallet",requestId,reference:body.reference,expectedTotal:body.expectedTotal,items:body.items}),
  });
  const response = await handleOrder(forwarded,auth.principal.user);
  response.headers.set("Cache-Control","private, no-store");
  response.headers.set("Idempotency-Key",requestId);
  return response;
}
