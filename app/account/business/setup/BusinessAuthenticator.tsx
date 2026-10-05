"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function BusinessAuthenticator() {
  const router = useRouter();
  const [enrollment, setEnrollment] = useState<{ id: string; qr: string; secret: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function enroll() {
    setBusy(true); setError("");
    try {
      const client = createClient();
      const factors = await client.auth.mfa.listFactors();
      if (factors.error) throw Error("Unable to check your authenticators. Please try again.");
      if (factors.data.totp.some(f => f.status === "verified")) { router.refresh(); return; }
      for (const f of factors.data.all.filter(f => f.factor_type === "totp" && f.status === "unverified")) {
        const removed = await client.auth.mfa.unenroll({ factorId: f.id });
        if (removed.error) throw Error("Unable to restart authenticator setup. Please try again.");
      }
      const result = await client.auth.mfa.enroll({ factorType: "totp", friendlyName: "InGamePin Business" });
      if (result.error || !result.data?.totp) throw Error("Unable to prepare Google Authenticator. Please try again or contact support.");
      setEnrollment({ id: result.data.id, qr: result.data.totp.qr_code, secret: result.data.totp.secret });
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to start setup."); } finally { setBusy(false); }
  }
  async function verify(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!enrollment) return;
    const code = String(new FormData(event.currentTarget).get("code") || "");
    if (!/^[0-9]{6}$/.test(code)) { setError("Enter the 6-digit code from Google Authenticator."); return; }
    setBusy(true); setError("");
    try {
      const result = await createClient().auth.mfa.challengeAndVerify({ factorId: enrollment.id, code });
      if (result.error) throw Error("The code is incorrect or expired. Try again.");
      setEnrollment(null); router.replace("/account/portal"); router.refresh();
    } catch (e) { setError(e instanceof Error ? e.message : "Unable to verify the code."); } finally { setBusy(false); }
  }
  return <div className="space-y-4"><p className="text-sm text-slate-600">Open Google Authenticator, add an account, and scan the QR code. Then enter its 6-digit code below.</p>
    {!enrollment ? <button onClick={enroll} disabled={busy} className="rounded-xl bg-blue-600 px-4 py-3 font-bold text-white disabled:opacity-50">{busy ? "Preparing..." : "Show QR code"}</button> : <form onSubmit={verify} className="space-y-4">
      {/* QR data comes directly from the authenticated Supabase enrollment response. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={enrollment.qr} alt="Google Authenticator setup QR code" className="mx-auto w-full max-w-60"/>
      <details className="text-sm"><summary>Cannot scan? Use this setup key</summary><code className="mt-2 block break-all rounded-lg bg-slate-100 p-3">{enrollment.secret}</code></details>
      <label className="block text-sm font-bold">6-digit code<input name="code" required pattern="[0-9]{6}" maxLength={6} inputMode="numeric" autoComplete="one-time-code" className="mt-2 w-full rounded-lg border p-3"/></label>
      <button disabled={busy} className="w-full rounded-xl bg-blue-600 p-3 font-bold text-white disabled:opacity-50">{busy ? "Verifying..." : "Enable and open business portal"}</button>
    </form>}{error && <p role="alert" className="text-sm text-red-700">{error}</p>}
  </div>;
}
