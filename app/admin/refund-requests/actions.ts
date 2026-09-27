"use server";
import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRefundAdmin } from "@/lib/order-refund-data";
import { refundId } from "@/lib/order-refund-request";

export async function reviewOrderRefund(form: FormData) {
  const user = await requireRefundAdmin();
  let requestId: string;
  try { requestId = refundId(form.get("request_id")); } catch { return { error: "Invalid refund reference." }; }
  const action = String(form.get("action") ?? "");
  const note = String(form.get("note") ?? "").trim();
  const reference = String(form.get("reference") ?? "").trim();
  if (!["APPROVE", "REJECT", "COMPLETE"].includes(action) || note.length > 1000) return { error: "Invalid refund action." };
  if (action === "REJECT" && note.length < 3) return { error: "Enter a reason for declining the refund." };
  if (action === "COMPLETE" && (form.get("confirmed") !== "on" || reference.length < 3 || reference.length > 200)) return { error: "Confirm the refund has been sent and enter its transaction ID." };
  const admin = createAdminClient();
  const existing = await admin.from("order_refund_requests").select("order_id").eq("id", requestId).maybeSingle();
  if (existing.error || !existing.data) return { error: "Refund request not found." };
  const result = await admin.rpc("review_customer_order_refund", { p_request_id: requestId, p_admin_id: user.id, p_action: action, p_note: note, p_reference: reference });
  if (result.error) return { error: result.error.code === "P0001" ? result.error.message : "Unable to confirm the refund. Reload its history before trying again." };
  for (const path of ["/admin/refund-requests", "/admin/orders", "/admin/wallet", "/account/wallet", "/account/dashboard", `/admin/orders/${existing.data.order_id}/receipt`, `/account/orders/${existing.data.order_id}`]) revalidatePath(path);
  return { status: String(result.data) };
}
