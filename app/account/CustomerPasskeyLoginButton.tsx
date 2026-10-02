"use client";

import { useState } from "react";
import styles from "@/components/PasskeyLogin.module.css";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { resetRegistrationTurnstile } from "@/components/RegistrationTurnstile";
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

    try {
      const supabase = createClient();
      const result = await supabase.auth.signInWithPasskey({
        options: { captchaToken },
      });

      if (result.error || !result.data.user) {
        resetRegistrationTurnstile();
        setMessage("Unable to sign in with this passkey. Try again.");
        return;
      }

      await recordCustomerPasskeyLogin();
      router.replace("/account/dashboard");
      router.refresh();
    } catch {
      resetRegistrationTurnstile();
      setMessage("Unable to sign in with this passkey. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        disabled={busy}
        onClick={signInWithPasskey}
        className={styles.button}
        aria-busy={busy}
      >
        {busy ? "Checking passkey..." : "Sign in with Passkey"}
      </button>
      {message && <p role="alert" className={styles.error}>{message}</p>}
    </div>
  );
}
