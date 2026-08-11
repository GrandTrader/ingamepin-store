"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

const DISMISSED_KEY = "ingamepin_customer_passkey_reminder_dismissed";

export default function CustomerPasskeyReminder() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (window.localStorage.getItem(DISMISSED_KEY) === "1") return;

    const supabase = createClient();
    void supabase.auth.passkey.list().then((result) => {
      if (!result.error && result.data.length === 0) setVisible(true);
    });
  }, []);

  if (!visible) return null;

  return (
    <div className="mb-6 flex flex-col justify-between gap-4 rounded-2xl border border-cyan-200 bg-cyan-50 p-5 sm:flex-row sm:items-center">
      <div>
        <p className="font-black text-slate-950">Protect your account with a Passkey</p>
        <p className="mt-1 text-sm text-slate-600">Sign in securely using your phone, fingerprint, face or device PIN.</p>
      </div>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => {
            window.localStorage.setItem(DISMISSED_KEY, "1");
            setVisible(false);
          }}
          className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold"
        >
          Not now
        </button>
        <Link href="/account/security" className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-slate-950">
          Enable Passkey
        </Link>
      </div>
    </div>
  );
}
