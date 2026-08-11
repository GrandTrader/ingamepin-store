"use client";

import { useRef, useState } from "react";

import { verifyAdminMfa } from "./actions";

export default function MfaVerificationForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  function updateCode(value: string) {
    const nextCode = value.replace(/\D/g, "").slice(0, 6);
    setCode(nextCode);

    if (nextCode.length === 6 && !submitting) {
      setSubmitting(true);

      window.setTimeout(() => {
        formRef.current?.requestSubmit();
      }, 0);
    }
  }

  return (
    <form
      ref={formRef}
      action={verifyAdminMfa}
      className="mt-7 space-y-5"
    >
      <label className="block">
        <span className="text-sm font-bold">
          Authenticator code
        </span>
        <input
          value={code}
          onChange={(event) => updateCode(event.target.value)}
          name="verification_code"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          minLength={6}
          maxLength={6}
          required
          autoFocus
          readOnly={submitting}
          placeholder="123456"
          className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-center text-xl tracking-[0.35em] outline-none transition focus:border-cyan-400 read-only:opacity-60"
        />
      </label>

      <button
        type="submit"
        disabled={submitting || code.length !== 6}
        onClick={() => setSubmitting(true)}
        className="w-full rounded-xl bg-cyan-400 px-5 py-3 font-black text-slate-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? "Verifying..." : "Verify and open Admin"}
      </button>

      <p className="text-center text-xs text-slate-500">
        Verification starts automatically after 6 digits.
      </p>
    </form>
  );
}
