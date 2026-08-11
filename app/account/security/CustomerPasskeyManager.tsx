"use client";

import { useCallback, useEffect, useState } from "react";

import { createClient } from "@/lib/supabase/client";

type Passkey = { id: string; friendly_name?: string; created_at: string };

export default function CustomerPasskeyManager() {
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    const result = await createClient().auth.passkey.list();
    if (result.error) setMessage("Unable to load your passkeys.");
    else setPasskeys(result.data);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function addPasskey() {
    setBusy(true);
    setMessage("");
    const result = await createClient().auth.registerPasskey();
    if (result.error) setMessage(result.error.message || "Passkey registration failed.");
    else {
      window.localStorage.removeItem("ingamepin_customer_passkey_reminder_dismissed");
      setMessage("Passkey registered successfully.");
      await load();
    }
    setBusy(false);
  }

  async function removePasskey(id: string) {
    if (!window.confirm("Remove this passkey from your account?")) return;
    setBusy(true);
    const result = await createClient().auth.passkey.delete({ passkeyId: id });
    setMessage(result.error ? "Unable to remove this passkey." : "Passkey removed successfully.");
    if (!result.error) await load();
    setBusy(false);
  }

  return (
    <div className="mt-6">
      {loading ? <p className="text-sm text-slate-500">Loading passkeys...</p> : passkeys.length ? (
        <div className="space-y-3">
          {passkeys.map((passkey) => (
            <div key={passkey.id} className="flex flex-col justify-between gap-4 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center">
              <div><p className="font-black">{passkey.friendly_name || "Registered passkey"}</p><p className="mt-1 text-xs text-slate-500">Added {new Date(passkey.created_at).toLocaleDateString("en-IN")}</p></div>
              <button type="button" disabled={busy} onClick={() => removePasskey(passkey.id)} className="rounded-xl border border-red-200 px-4 py-2 text-sm font-bold text-red-600">Remove</button>
            </div>
          ))}
        </div>
      ) : <p className="rounded-xl border border-slate-200 p-4 text-sm text-slate-500">No passkey is connected yet.</p>}

      <button type="button" disabled={busy || loading} onClick={addPasskey} className="mt-4 rounded-xl bg-cyan-500 px-5 py-3 font-black text-slate-950 disabled:opacity-60">
        {busy ? "Please wait..." : "+ Register new passkey"}
      </button>
      {message && <p className="mt-4 rounded-xl border border-cyan-200 bg-cyan-50 p-4 text-sm text-cyan-800">{message}</p>}
    </div>
  );
}
