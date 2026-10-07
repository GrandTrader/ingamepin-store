import Link from "next/link";
import { paypalCheckoutAvailable } from "@/lib/paypal-checkout";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/admin-session";
import { paypalSandboxConfiguration } from "@/lib/paypal-sandbox";
import PayPalSandboxCheckout from "./PayPalSandboxCheckout";

export const dynamic = "force-dynamic";

export default async function PayPalSandboxPage() {
  const client = await createClient({ reuseVerifiedUser: true });
  const { data: { user } } = await client.auth.getUser();
  if (!user) redirect("/admin/login");
  const access = await client.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) redirect("/admin/login?error=Administrator%20access%20is%20required.");
  const liveEnabled = await paypalCheckoutAvailable();
  let configured = false;
  try { paypalSandboxConfiguration(); configured = true; } catch { /* Keep credentials and configuration errors private. */ }
  return <main className="mx-auto max-w-xl px-4 py-10 text-slate-900">
    <Link href="/admin/payment-settings" className="text-sm font-bold text-blue-700">← Payment settings</Link>
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6">
      <h1 className="text-xl font-black">Customer PayPal checkout</h1>
      <p className="mt-3 text-sm text-slate-600">{liveEnabled ? "Enabled for products that allow PayPal. Payments are charged in USD." : "Disabled. Complete the Live settings, database update and webhook setup before enabling customer payments."}</p>
    </section>
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">Sandbox · Test payments only</span>
      <h1 className="mt-5 text-2xl font-black">Test PayPal checkout</h1>
      <p className="mt-3 text-sm leading-6 text-slate-600">Use your PayPal Sandbox buyer account. This test uses virtual funds and does not create a store order, deliver codes, or change your wallet.</p>
      <div className="my-6 flex items-center justify-between rounded-xl bg-slate-50 p-4"><span className="font-bold">Test payment</span><strong className="text-2xl">$1.00 <span className="text-sm">USD</span></strong></div>
      {configured ? <PayPalSandboxCheckout /> : <p role="alert" className="rounded-xl bg-amber-50 p-4 text-sm text-amber-900">Add the Sandbox Client ID and Secret to the local settings file to enable this test.</p>}
    </section>
  </main>;
}
