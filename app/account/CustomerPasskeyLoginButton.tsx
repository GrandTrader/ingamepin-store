"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { recordCustomerPasskeyLogin } from "./actions";

export default function CustomerPasskeyLoginButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function signInWithPasskey() {
    setBusy(true);
    setMessage("");

    const captchaToken = document.querySelector<HTMLInputElement>(
      'input[name="captcha_token"]',
    )?.value ?? "";

    if (!captchaToken) {
      setMessage("Complete the security check first.");
      setBusy(false);
      return;
    }

    const supabase = createClient();
    const result = await supabase.auth.signInWithPasskey({
      options: { captchaToken },
    });

    if (result.error || !result.data.user) {
      setMessage(result.error?.message ?? "Unable to sign in with this passkey.");
      setBusy(false);
      return;
    }

    await recordCustomerPasskeyLogin();
    router.replace("/account/dashboard");
    router.refresh();
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={signInWithPasskey}
        className="w-full rounded-xl border border-cyan-500 px-5 py-3 font-black text-cyan-700 transition hover:bg-cyan-50 disabled:opacity-60"
      >
        {busy ? "Checking passkey..." : "Sign in with Passkey"}
      </button>
      {message && <p className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{message}</p>}
    </div>
  );
}
