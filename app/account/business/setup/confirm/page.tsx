"use client";
import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { acceptBusinessSetupEmail } from "../actions";
export default function BusinessSetupEmailConfirmation() {
  const router = useRouter(); const [busy, setBusy] = useState(false); const [error, setError] = useState("");
  const confirming = useRef(false);
  async function confirm() {
    if (confirming.current) return;
    confirming.current = true;
    setBusy(true); setError("");
    try {
      const token = new URLSearchParams(window.location.hash.slice(1)).get("token_hash") || "";
      if (token) {
        const result = await acceptBusinessSetupEmail(token);
        if (result.error) { setError(result.error); return; }
        // Only discard a link after successful verification, so failed requests can be retried.
        window.history.replaceState(null, "", window.location.pathname);
      }
      // A reopened page may no longer have a token. The setup page independently
      // checks the current user and business approval, or sends them to B2B login.
      router.replace("/account/business/setup"); router.refresh();
    } catch { setError("Unable to check the setup link. Please try again, or sign in below if you already created your password."); } finally { confirming.current = false; setBusy(false); }
  }
  return <main className="bg-slate-50 px-4 py-10"><section className="mx-auto max-w-md space-y-4 rounded-2xl border bg-white p-6 text-slate-900"><h1 className="text-2xl font-black">Set up your B2B account</h1><p className="text-sm">Continue to create your password and connect Google Authenticator.</p><button onClick={confirm} disabled={busy} className="w-full rounded-xl bg-blue-600 p-3 font-bold text-white disabled:opacity-50">{busy ? "Checking link..." : "Continue account setup"}</button>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}<div className="border-t pt-4 text-sm"><p>Already created your password?</p><Link href="/business/login" prefetch={false} className="mt-2 inline-block font-bold text-blue-700 underline">Sign in to continue setup</Link></div></section></main>;
}
