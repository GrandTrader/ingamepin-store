"use server";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/customer-account-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRefundRequest } from "@/lib/order-refund-request";
import { sendEmail, SUPPORT_EMAIL } from "@/lib/email";

export async function requestOrderRefund(form: FormData) {
  const { user } = await requireCustomer();
  let input;
  try { input = parseRefundRequest(form); } catch (e) { return { error: e instanceof Error ? e.message : "Check the refund details." }; }
  const result = await createAdminClient().rpc("request_customer_order_refund", {
    p_order_id: input.orderId, p_customer_id: user.id, p_method: input.method, p_details: input.details, p_reason: input.reason, p_network: input.network || null,
  });
  if (result.error) return { error: result.error.code === "P0001" ? result.error.message : "Unable to submit the refund request. Please try again or contact support." };
  try {
    const text = `A customer submitted an order refund enquiry.\nOrder ID: ${input.orderId}\nCustomer: ${user.email ?? user.id}\nRefund method: ${input.method}\n\nReview the request: https://www.ingamepin.com/admin/refund-requests`;
    const email = await sendEmail({ to: SUPPORT_EMAIL, replyTo: user.email ?? SUPPORT_EMAIL, subject: "New InGamePin refund enquiry", text,
      html: `<pre style="white-space:pre-wrap;font-family:Arial,sans-serif">${text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;")}</pre>` });
    if (email.rejected?.length) throw new Error("Support email rejected.");
  } catch { console.error("Refund support notification failed."); }
  revalidatePath(`/account/orders/${input.orderId}`);
  revalidatePath(`/account/portal/orders/${input.orderId}`);
  revalidatePath(`/admin/orders/${input.orderId}/receipt`);
  revalidatePath("/admin/refund-requests");
  return { success: true };
}
