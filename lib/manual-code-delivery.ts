import "server-only";
import { after } from "next/server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendOrderStatusEmails } from "@/lib/email";

export async function saveManualDeliveryCodes(formData: FormData, administratorId: string) {
  const orderId = String(formData.get("order_id") ?? ""); const itemId = String(formData.get("item_id") ?? "");
  const codes = String(formData.get("codes") ?? "").split(/\r?\n/).map((code) => code.trim()).filter(Boolean);
  if (!orderId || !itemId) return { error: "Order item is invalid.", success: "" };
  if (new Set(codes).size !== codes.length) return { error: "Duplicate delivery codes are not allowed.", success: "" };
  const admin = createAdminClient();
  const itemResult = await admin.from("order_items").select("id, order_id, product_id, product_option_id, product_name, option_name, denomination, quantity, fulfillment_mode, products!inner(delivery_type, is_bulk_order)").eq("id", itemId).eq("order_id", orderId).maybeSingle();
  const item = itemResult.data; const itemProduct=item&&(Array.isArray(item.products)?item.products[0]:item.products); if (!item || (itemProduct?.delivery_type!=="MANUAL"&&item.fulfillment_mode!=="RANGE_MANUAL") || item.fulfillment_mode === "PLAYER_ID_TOPUP") return { error: "This denomination cannot be sent as codes.", success: "" };
  if (codes.length < 1) return { error: "Enter at least one delivery code.", success: "" };
  const delivery = await admin.rpc("deliver_manual_codes_batch", {
    p_order_id: orderId,
    p_item_id: itemId,
    p_admin_user_id: administratorId,
    p_codes: codes,
  });
  if (delivery.error) return { error: delivery.error.message, success: "" };
  const codesToDeliver = (delivery.data?.codes ?? []) as string[];
  const skippedCodeCount = Number(delivery.data?.skipped ?? 0);
  if (codesToDeliver.length > 0) {
    // Delivery is committed. Email must not delay or break the saved result.
    after(async () => {
      try {
        const orderResult = await admin.from("orders").select("order_number, customer_name, customer_email, total, currency, status").eq("id", orderId).single();
        if (orderResult.error || !orderResult.data) throw new Error("Order notification details unavailable");
        const order = orderResult.data;
        const results = await sendOrderStatusEmails({ orderId, event: "PRODUCT_SENT", orderNumber: order.order_number, customerName: order.customer_name ?? "Customer", customerEmail: order.customer_email, total: Number(order.total), currency: order.currency, orderStatus: order.status, deliveredItems: [{ productName: item.product_name, optionName: item.option_name, codes: codesToDeliver }] });
        if (results.some((result) => result.status === "rejected")) {
          console.error("Manual delivery email failed", { orderId, itemId });
        }
      } catch {
        console.error("Manual delivery email failed", { orderId, itemId });
      }
    });
  }
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderId}/receipt`);
  return {
    error: "",
    success: codesToDeliver.length === 0
      ? `All ${skippedCodeCount} code(s) were already saved. Nothing was delivered twice.`
      : `${codesToDeliver.length} new code(s) saved. Customer email is being sent separately.${skippedCodeCount > 0 ? ` ${skippedCodeCount} previously delivered code(s) were skipped.` : ""}`,
  };
}

