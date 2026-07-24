import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../AdminSidebar";
import { savePaymentSettings } from "./actions";

export const dynamic = "force-dynamic";

export default async function PaymentSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; success?: string }>;
}) {
  const { error, success } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const access = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!access.data) redirect("/admin/login?error=Access denied");

  const settings = await createAdminClient()
    .from("payment_gateway_settings")
    .select("pally_usd_rub_rate")
    .eq("id", true)
    .maybeSingle();

  if (settings.error) {
    throw new Error(
      `Unable to load payment settings: ${settings.error.message}`,
    );
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col md:flex-row">
        <AdminSidebar />

        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <h1 className="text-3xl font-black">Payment Settings</h1>
          <p className="mt-2 text-sm text-slate-500">
            Manage the conversion rate used for Pally payments.
          </p>

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
              {success}
            </div>
          )}

          <form
            action={savePaymentSettings}
            className="mt-8 max-w-xl rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm"
          >
            <h2 className="text-xl font-black">Pally exchange rate</h2>

            <label
              htmlFor="pally_usd_rub_rate"
              className="mt-6 block text-sm font-bold text-slate-700"
            >
              1 USD equals
            </label>

            <div className="mt-2 flex items-center overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-blue-500">
              <span className="px-4 text-lg font-black text-slate-500">₽</span>
              <input
                id="pally_usd_rub_rate"
                name="pally_usd_rub_rate"
                type="number"
                min="1"
                max="1000"
                step="0.0001"
                required
                defaultValue={Number(
                  settings.data?.pally_usd_rub_rate ?? 85,
                )}
                className="min-w-0 flex-1 border-0 px-2 py-3 text-lg font-bold outline-none"
              />
              <span className="px-4 text-sm font-bold text-slate-500">RUB</span>
            </div>

            <p className="mt-3 text-sm text-slate-500">
              This rate applies to newly created Pally payment links.
            </p>

            <button
              type="submit"
              className="mt-6 rounded-xl bg-blue-600 px-6 py-3 font-black text-white transition hover:bg-blue-700"
            >
              Save exchange rate
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}
