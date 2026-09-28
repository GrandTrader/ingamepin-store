import {createAdminClient} from "@/lib/supabase/admin";
import {sendOrderCreatedEmails,sendOrderStatusEmails,sendWalletDebitEmails} from "@/lib/email";
import {notifyPaidOrderInTelegram} from "@/lib/telegram-order-notification";
import type {PortalQuote} from "@/lib/portal-checkout";

// Called only for a newly committed confirmation, never an idempotent replay.
export async function notifyPortalOrder(result:PortalQuote) {
 const admin=createAdminClient();
 const [order,items]=await Promise.all([
  admin.from("orders").select("id,order_number,customer_name,customer_email,total,currency,status").eq("id",result.orderId!).single(),
  admin.from("order_items").select("product_name,option_name,denomination,platform,quantity").eq("order_id",result.orderId!).order("created_at"),
 ]);
 if(order.error||items.error)throw Error("Unable to load portal order notifications.");
 const o=order.data;
 const common={orderId:o.id,orderNumber:o.order_number,customerName:o.customer_name??"Customer",customerEmail:o.customer_email,total:Number(o.total),currency:o.currency};
 const outcomes=await Promise.allSettled([
  sendOrderCreatedEmails({...common,paymentMethod:"WALLET",status:o.status,items:(items.data??[]).map(i=>({productName:i.product_name,optionName:i.option_name,denomination:i.denomination===null?null:Number(i.denomination),platform:i.platform,quantity:i.quantity}))}),
  sendWalletDebitEmails({...common,amount:Number(o.total),balanceAfter:Number(result.balanceAfter)}),
  sendOrderStatusEmails({...common,event:"PAYMENT_APPROVED",orderStatus:o.status}),
  notifyPaidOrderInTelegram(o.id),
 ]);
 for(const outcome of outcomes){
  if(outcome.status==="rejected")console.error("Portal order notification failed",outcome.reason);
  else if(Array.isArray(outcome.value))for(const delivery of outcome.value)if(delivery.status==="rejected")console.error("Portal order email failed",delivery.reason);
 }
}
