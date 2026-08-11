"use client";

import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type PasskeyItem = {
  id: string;
  friendly_name?: string;
  created_at: string;
  last_used_at?: string;
};

export default function PasskeyManager() {
  const [passkeys, setPasskeys] = useState<PasskeyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const loadPasskeys = useCallback(async () => {
    const supabase = createClient();
    const result = await supabase.auth.passkey.list();

    if (result.error) {
      setMessage("Unable to load registered passkeys.");
      setLoading(false);
      return;
    }

    setPasskeys(result.data);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadPasskeys();
  }, [loadPasskeys]);

  async function addPasskey() {
    setBusy(true);
    setMessage("");

    const supabase = createClient();
    const result = await supabase.auth.registerPasskey();

    if (result.error) {
      setMessage(
        result.error.message ||
          "Passkey registration was cancelled or failed."
      );
      setBusy(false);
      return;
    }

    setMessage("Passkey registered successfully.");
    await loadPasskeys();
    setBusy(false);
  }

  async function removePasskey(passkeyId: string) {
    const confirmed = window.confirm(
      "Remove this passkey from Admin login?"
    );

    if (!confirmed) return;

    setBusy(true);
    setMessage("");

    const supabase = createClient();
    const result = await supabase.auth.passkey.delete({
      passkeyId,
    });

    if (result.error) {
      setMessage("Unable to remove this passkey.");
      setBusy(false);
      return;
    }

    setMessage("Passkey removed successfully.");
    await loadPasskeys();
    setBusy(false);
  }

  return (
    <div className="mt-5">
      {loading ? (
        <p className="text-sm text-slate-500">
          Loading passkeys...
        </p>
      ) : passkeys.length > 0 ? (
        <div className="space-y-3">
          {passkeys.map((passkey) => (
            <div
              key={passkey.id}
              className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center"
            >
              <div>
                <p className="font-black text-slate-900">
                  {passkey.friendly_name || "Registered passkey"}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Added {new Date(passkey.created_at).toLocaleDateString("en-IN")}
                </p>
              </div>

              <button
                type="button"
                disabled={busy}
                onClick={() => removePasskey(passkey.id)}
                className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-600 transition hover:bg-red-50 disabled:opacity-60"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">
          No passkey is connected yet.
        </p>
      )}

      <button
        type="button"
        disabled={busy || loading}
        onClick={addPasskey}
        className="mt-4 rounded-xl bg-blue-600 px-5 py-3 font-black text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? "Please wait..." : "+ Register new passkey"}
      </button>

      {message && (
        <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-700">
          {message}
        </div>
      )}
    </div>
  );
}
