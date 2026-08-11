"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

type AdminMfaSetupProps = {
  adminEmail: string;
  hasVerifiedFactor: boolean;
};

type EnrollmentDetails = {
  factorId: string;
  qrCode: string;
  secret: string;
};

export default function AdminMfaSetup({
  adminEmail,
  hasVerifiedFactor,
}: AdminMfaSetupProps) {
  const router = useRouter();
  const [enrollment, setEnrollment] =
    useState<EnrollmentDetails | null>(null);
  const [verificationCode, setVerificationCode] =
    useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function beginEnrollment() {
    setBusy(true);
    setMessage("");

    const supabase = createClient();
    const factorsResult = await supabase.auth.mfa.listFactors();

    if (!factorsResult.error) {
      const unfinishedFactors = factorsResult.data.all.filter(
        (factor) =>
          factor.factor_type === "totp" &&
          factor.status === "unverified"
      );

      for (const factor of unfinishedFactors) {
        await supabase.auth.mfa.unenroll({
          factorId: factor.id,
        });
      }
    }

    const result = await supabase.auth.mfa.enroll({
      factorType: "totp",
      friendlyName: "InGamePin Admin",
    });

    if (result.error || !result.data.totp) {
      setMessage(
        result.error?.message ??
          "Unable to create the authenticator setup."
      );
      setBusy(false);
      return;
    }

    setEnrollment({
      factorId: result.data.id,
      qrCode: result.data.totp.qr_code,
      secret: result.data.totp.secret,
    });
    setBusy(false);
  }

  async function verifyEnrollment(
    event: React.FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!enrollment) return;

    const code = verificationCode.replace(/\D/g, "");

    if (code.length !== 6) {
      setMessage("Enter the 6-digit code from your authenticator app.");
      return;
    }

    setBusy(true);
    setMessage("");

    const supabase = createClient();
    const result = await supabase.auth.mfa.challengeAndVerify({
      factorId: enrollment.factorId,
      code,
    });

    if (result.error) {
      setMessage("The verification code is incorrect or expired.");
      setBusy(false);
      return;
    }

    router.replace("/admin");
    router.refresh();
  }

  if (hasVerifiedFactor) {
    return (
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-7 shadow-2xl sm:p-9">
        <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-400">
          Admin security
        </p>
        <h1 className="mt-3 text-3xl font-black">
          Authenticator connected
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-400">
          Google Authenticator verification is already enabled for {adminEmail}.
        </p>
      </section>
    );
  }

  return (
    <section className="w-full max-w-md rounded-3xl border border-white/10 bg-slate-900 p-7 shadow-2xl sm:p-9">
      <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-400">
        Admin security
      </p>
      <h1 className="mt-3 text-3xl font-black">
        Set up two-step verification
      </h1>
      <p className="mt-3 text-sm leading-6 text-slate-400">
        Connect Google Authenticator to {adminEmail} before continuing to the admin panel.
      </p>

      {!enrollment ? (
        <button
          type="button"
          disabled={busy}
          onClick={beginEnrollment}
          className="mt-7 w-full rounded-xl bg-cyan-400 px-5 py-3 font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Preparing..." : "Generate QR code"}
        </button>
      ) : (
        <form onSubmit={verifyEnrollment} className="mt-7 space-y-5">
          <div className="rounded-2xl bg-white p-4">
            {/* Supabase returns the QR code as a safe data URL. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enrollment.qrCode}
              alt="Google Authenticator QR code"
              className="mx-auto h-auto w-full max-w-64"
            />
          </div>

          <div>
            <p className="text-sm font-bold">Manual setup key</p>
            <code className="mt-2 block break-all rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-cyan-300">
              {enrollment.secret}
            </code>
          </div>

          <label className="block">
            <span className="text-sm font-bold">6-digit verification code</span>
            <input
              value={verificationCode}
              onChange={(event) =>
                setVerificationCode(
                  event.target.value.replace(/\D/g, "").slice(0, 6)
                )
              }
              name="verification_code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              required
              placeholder="123456"
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-center text-xl tracking-[0.35em] outline-none transition focus:border-cyan-400"
            />
          </label>

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-cyan-400 px-5 py-3 font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {busy ? "Verifying..." : "Enable two-step verification"}
          </button>
        </form>
      )}

      {message && (
        <div className="mt-5 rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">
          {message}
        </div>
      )}
    </section>
  );
}
