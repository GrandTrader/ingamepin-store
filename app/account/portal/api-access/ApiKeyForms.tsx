"use client";

import { useActionState, useState } from "react";
import { createBusinessKey, updateBusinessKey, type ApiKeyState } from "./actions";
import s from "../Portal.module.css";

function Feedback({ state }: { state: ApiKeyState }) {
  return <>{state.error && <p role="alert" className={`${s.notice} ${s.error}`}>{state.error}</p>}{state.message && <p role="status" className={s.notice}>{state.message}</p>}</>;
}

export function NewApiKeyForm({ available = true }: { available?: boolean }) {
  const [state, action, pending] = useActionState(createBusinessKey, {});
  const [copied, setCopied] = useState("");
  return <section className={s.card}><h2 className={s.sectionTitle}>Create API key</h2><Feedback state={state}/>
    {state.secret && <div className={s.apiKey}><code data-no-auto-translate>{state.secret}</code><button type="button" className={s.button} onClick={async()=>{try{await navigator.clipboard.writeText(state.secret!);setCopied(state.secret!);}catch{setCopied("");}}}>{copied === state.secret ? "Copied" : "Copy key"}</button></div>}
    <form action={action} className={s.apiForm}>
      <label>Key name<input name="name" required minLength={2} maxLength={80} placeholder="My website server"/></label>
      <label>Allowed IP addresses<textarea name="ips" required placeholder={"203.0.113.10\n2001:db8::10"}/></label>
      <p className={s.helper}>One server IP per line. Every request must come from an allowed IP. For localhost testing, use 127.0.0.1.</p>
      <label>Expires after<select name="days" defaultValue="90"><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option></select></label>
      <label className={s.apiPermission}><input name="can_order" type="checkbox"/> Allow order placement and wallet payments</label>
      <p className={s.helper}>Read-only keys can check products, wallet balance, orders and delivered codes.</p>
      <button className={s.primary} disabled={pending || !available}>{pending ? "Creating…" : "Create key"}</button>
    </form>
  </section>;
}

export type ApiKeyRow = { id: string; name: string; key_prefix: string; allowed_ips: string[]; can_order: boolean; created_at: string; expires_at: string; revoked_at: string|null; last_used_at: string|null };
export function ExistingApiKey({ apiKey }: { apiKey: ApiKeyRow }) {
  const [state, action, pending] = useActionState(updateBusinessKey, {});
  const inactive = !!apiKey.revoked_at || Date.parse(apiKey.expires_at) <= Date.now();
  return <section className={s.card}><div className={s.titleLine}><h2>{apiKey.name}</h2><span className={`${s.badge} ${inactive ? s.cancelled : ""}`}>{apiKey.revoked_at ? "Revoked" : inactive ? "Expired" : "Active"}</span></div>
    <p><code>{apiKey.key_prefix}</code></p><p className={s.helper}>Expires {new Date(apiKey.expires_at).toLocaleDateString("en-GB")} · {apiKey.last_used_at ? `Last used ${new Date(apiKey.last_used_at).toLocaleString("en-GB")}` : "Not used yet"}</p>
    <Feedback state={state}/>{!inactive && <form action={action} className={s.apiForm}>
      <input type="hidden" name="id" value={apiKey.id}/>
      <label>Allowed IP addresses<textarea name="ips" required defaultValue={apiKey.allowed_ips.join("\n")}/></label>
      <label className={s.apiPermission}><input type="checkbox" name="can_order" defaultChecked={apiKey.can_order}/> Allow order placement and wallet payments</label>
      <div className={s.actions}><button name="operation" value="update" className={s.primary} disabled={pending}>Save changes</button><button name="operation" value="revoke" formNoValidate className={s.button} disabled={pending}>Revoke key</button></div>
    </form>}
  </section>;
}
