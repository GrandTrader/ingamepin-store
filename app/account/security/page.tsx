import CustomerAccountShell from "../CustomerAccountShell";
import CustomerPasskeyManager from "./CustomerPasskeyManager";
import { requireCustomer } from "@/lib/customer-account-data";

export const dynamic = "force-dynamic";

export default async function CustomerSecurityPage() {
  const { displayName } = await requireCustomer();

  return (
    <CustomerAccountShell displayName={displayName}>
      <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-600">Account protection</p>
      <h1 className="mt-2 text-3xl font-black">Security</h1>
      <p className="mt-2 text-slate-500">Use a Passkey to sign in without Google Authenticator codes.</p>

      <section className="mt-7 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7">
        <h2 className="text-xl font-black">Passkeys</h2>
        <p className="mt-2 text-sm leading-6 text-slate-500">Your fingerprint, face unlock, device PIN or security key can securely sign you in.</p>
        <CustomerPasskeyManager />
      </section>
    </CustomerAccountShell>
  );
}
