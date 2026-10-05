import Link from "next/link";
import { portalCustomer } from "@/lib/business-portal-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { ExistingApiKey, NewApiKeyForm, type ApiKeyRow } from "./ApiKeyForms";
import s from "../Portal.module.css";

export default async function ApiAccessPage() {
  const { user } = await portalCustomer();
  const result = await createAdminClient().from("business_api_keys").select("id,name,key_prefix,allowed_ips,can_order,created_at,expires_at,revoked_at,last_used_at").eq("user_id",user.id).order("revoked_at",{ascending:false,nullsFirst:true}).order("expires_at",{ascending:false}).order("created_at",{ascending:false}).limit(50);
  const approval=await createAdminClient().from("business_api_ip_approvals").select("ips").eq("user_id",user.id).maybeSingle();
  return <div className={s.apiStack}><div className={s.titleLine}><h2>API access</h2><Link className={s.button} href="/account/portal/api-docs">API documentation ↗</Link></div>
    <p className={s.muted}>Connect your website to your business catalogue, wallet and orders.</p>
    {result.error && <p role="alert" className={`${s.notice} ${s.error}`}>API key management is not available yet. The business API database update must be installed first.</p>}
    <section className={s.card}><h3 className={s.sectionTitle}>Admin-approved static server IPs</h3>{approval.error ? <p className={s.error}>Unable to load IP approvals. Contact support.</p> : approval.data?.ips?.length ? <ul>{approval.data.ips.map((ip:string)=><li key={ip}><code>{ip}</code></li>)}</ul> : <p>No IPs approved yet. Contact support with your server&apos;s fixed (static) outgoing public IP address.</p>}<p className={s.helper}>Only an admin can approve or change these IPs. Choose one approved static IP for each API key.</p></section>
    <NewApiKeyForm approvedIps={approval.data?.ips ?? []} available={!result.error && !approval.error && !!approval.data?.ips?.length}/>{((result.data ?? []) as ApiKeyRow[]).map(key=><ExistingApiKey key={key.id} apiKey={key}/>)}
  </div>;
}
