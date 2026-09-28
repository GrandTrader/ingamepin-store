"use server";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/customer-account-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { parseRefundRequest } from "@/lib/order-refund-request";

export async function requestOrderRefund(form: FormData) {
  const { user } = await requireCustomer();
  let input;
  try { input = parseRefundRequest(form); } catch (e) { return { error: e instanceof Error ? e.message : "Check the refund details." }; }
  const result = await createAdminClient().rpc("request_customer_order_refund", {
    p_order_id: input.orderId, p_customer_id: user.id, p_method: input.method, p_details: input.details, p_reason: input.reason, p_network: input.network || null,
  });
  if (result.error) return { error: result.error.code === "P0001" ? result.error.message : "Unable to submit the refund request. Please try again or contact support." };
  revalidatePath(`/account/orders/${input.orderId}`);
  revalidatePath(`/account/portal/orders/${input.orderId}`);
  revalidatePath(`/admin/orders/${input.orderId}/receipt`);
  revalidatePath("/admin/refund-requests");
  return { success: true };
}
