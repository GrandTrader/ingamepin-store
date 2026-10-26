import { createAdminClient } from "@/lib/supabase/admin";
import CustomerPurchaseAccessForm, { type PurchaseAccessState } from "./CustomerPurchaseAccessForm";

export default async function CustomerPurchaseAccess({ customerId }: { customerId: string }) {
  const result = await createAdminClient().rpc("customer_purchase_restriction_state", { p_customer: customerId });
  if (result.error || !result.data) return <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-xl font-black">Purchase restrictions</h2><p className="mt-2 text-sm">Purchase restriction setup is unavailable. Check the database update.</p></section>;
  const state = result.data as PurchaseAccessState;
  return <CustomerPurchaseAccessForm key={`${customerId}:${state.updatedAt ?? "new"}`} customerId={customerId} initial={state} />;
}
