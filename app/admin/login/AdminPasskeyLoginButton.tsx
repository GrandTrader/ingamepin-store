"use client";

import { useState } from "react";
import styles from "@/components/PasskeyLogin.module.css";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";
import { resetRegistrationTurnstile } from "@/components/RegistrationTurnstile";

export default function AdminPasskeyLoginButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function signInWithPasskey() {
    setBusy(true);
    setMessage("");

    const captchaToken =
      document.querySelector<HTMLInputElement>(
        'input[name="captcha_token"]'
      )?.value ?? "";

    if (!captchaToken) {
      setMessage("Complete the security check first.");
      setBusy(false);
      return;
    }

    try {
      const supabase = createClient();
      const loginResult = await supabase.auth.signInWithPasskey({
        options: {
          captchaToken,
        },
      });

      if (loginResult.error || !loginResult.data.user) {
        resetRegistrationTurnstile();
        setMessage("Unable to sign in with this passkey. Try again.");
        return;
      }

      const adminResult = await supabase
        .from("admin_users")
        .select("user_id")
        .eq("user_id", loginResult.data.user.id)
        .maybeSingle();

      if (adminResult.error || !adminResult.data) {
        await supabase.auth.signOut();
        resetRegistrationTurnstile();
        setMessage("This passkey is not connected to an administrator account.");
        return;
      }

      router.replace("/admin");
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

      {message && (
        <div role="alert" className={styles.error}>
          {message}
        </div>
      )}
    </div>
  );
}
