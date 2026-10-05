"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { acceptBusinessSetupEmail } from "../actions";
export default function BusinessSetupEmailConfirmation() {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  async function confirm() {
    setBusy(true); setError("");
    try {
      const token = new URLSearchParams(window.location.hash.slice(1)).get("token_hash") || "";
      const result = await acceptBusinessSetupEmail(token);
      window.history.replaceState(null, "", window.location.pathname);
      if (result.error) { setError(result.error); return; }
      router.replace("/account/business/setup"); router.refresh();
    } catch { setError("Unable to open the setup link. Ask support for a new setup email."); } finally { setBusy(false); }
  }
  return <main className="bg-slate-50 px-4 py-10"><section className="mx-auto max-w-md space-y-4 rounded-2xl border bg-white p-6 text-slate-900"><h1 className="text-2xl font-black">Set up your B2B account</h1><p className="text-sm">Continue to create your password and connect Google Authenticator.</p><button onClick={confirm} disabled={busy} className="w-full rounded-xl bg-blue-600 p-3 font-bold text-white disabled:opacity-50">{busy ? "Checking link..." : "Continue account setup"}</button>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}</section></main>;
}
