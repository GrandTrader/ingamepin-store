import Link from "next/link";
import { portalCustomer } from "@/lib/business-portal-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { ExistingApiKey, NewApiKeyForm, type ApiKeyRow } from "./ApiKeyForms";
import s from "../Portal.module.css";

export default async function ApiAccessPage() {
  const { user } = await portalCustomer();
  const result = await createAdminClient().from("business_api_keys").select("id,name,key_prefix,allowed_ips,can_order,created_at,expires_at,revoked_at,last_used_at").eq("user_id",user.id).order("revoked_at",{ascending:false,nullsFirst:true}).order("expires_at",{ascending:false}).order("created_at",{ascending:false}).limit(50);
  return <div className={s.apiStack}><div className={s.titleLine}><h2>API access</h2><Link className={s.button} href="/account/portal/api-docs">API documentation ↗</Link></div>
    <p className={s.muted}>Connect your website to your business catalogue, wallet and orders.</p>
    {result.error && <p role="alert" className={`${s.notice} ${s.error}`}>API key management is not available yet. The business API database update must be installed first.</p>}
    <NewApiKeyForm available={!result.error}/>{((result.data ?? []) as ApiKeyRow[]).map(key=><ExistingApiKey key={key.id} apiKey={key}/>)}
  </div>;
}
