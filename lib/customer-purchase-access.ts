import "server-only";
import { customerBrowserId } from "@/lib/customer-browser-id";
import { trustedClientIp } from "@/lib/trusted-client-ip";
import { createAdminClient } from "@/lib/supabase/admin";

export const PURCHASE_RESTRICTED = "New purchases are restricted. Please contact support. You can still view previous orders.";
export class CustomerPurchaseAccessError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
export type CustomerPurchaseContext = { browserId: string | null; ip: string | null };
export async function customerPurchaseContext(request: Request, api = false, apiIp?: string | null): Promise<CustomerPurchaseContext> {
  const browserId = api ? null : await customerBrowserId();
  if (!api && !browserId) throw new CustomerPurchaseAccessError("Unable to check purchase access. Please try again.", 503);
  return { browserId, ip: api ? apiIp ?? null : trustedClientIp(request.headers) };
}
export async function assertCustomerPurchaseAccess(
  db: ReturnType<typeof createAdminClient>, context: CustomerPurchaseContext,
  identity: { userId?: string | null; email?: string | null; bulkClientId?: string | null },
) {
  const result = await db.rpc("customer_purchase_access", {
    p_user: identity.userId ?? null, p_email: identity.email?.trim().toLowerCase() || null,
    p_browser: context.browserId, p_ip: context.ip, p_bulk_client: identity.bulkClientId ?? null,
  });
  if (result.error || typeof result.data !== "boolean")
    throw new CustomerPurchaseAccessError("Unable to check purchase access. Please try again.", 503);
  if (!result.data) throw new CustomerPurchaseAccessError(PURCHASE_RESTRICTED, 403);
}
