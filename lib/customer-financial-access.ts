import "server-only";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { customerPurchaseContext, CustomerPurchaseAccessError } from "@/lib/customer-purchase-access";

export const FINANCIAL_RESTRICTED = "Financial transactions are restricted. Contact support. You can still view your history.";

// Display checks use recorded account/device history; mutation checks below also
// include the signed browser cookie and trusted current network address.
export async function customerFinancialAccess(userId: string) {
  const result = await createAdminClient().rpc("customer_financial_access", { p_user: userId });
  return { allowed: !result.error && result.data === true, unavailable: !!result.error || typeof result.data !== "boolean" };
}
export async function requireCustomerFinancialAccess(userId: string, request?: Request) {
  const context = await customerPurchaseContext(request ?? { headers: await headers() } as Request);
  const result = await createAdminClient().rpc("customer_financial_access", {
    p_user: userId, p_browser: context.browserId, p_ip: context.ip,
  });
  if (result.error || typeof result.data !== "boolean")
    throw new CustomerPurchaseAccessError("Unable to verify financial access. Please try again.", 503);
  if (!result.data) throw new CustomerPurchaseAccessError(FINANCIAL_RESTRICTED, 403);
}
