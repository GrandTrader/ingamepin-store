import Link from "next/link";
import { notFound } from "next/navigation";
import AdminSidebar from "../../AdminSidebar";
import AuthSubmitButton from "@/components/AuthSubmitButton";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireSellerAdministrator } from "@/lib/seller-access";
import { sellerVerificationChecks, SELLER_DECLARATION, SELLER_DECLARATION_VERSION, type SellerApplication } from "@/lib/seller-application";
import { reviewSellerApplication } from "../actions";
export const dynamic = "force-dynamic";
export default async function SellerReviewPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; success?: string }> }) {
  await requireSellerAdministrator();
  const { id } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) notFound();
  const db = createAdminClient();
  const result = await db.from("seller_accounts").select("*").eq("id", id).maybeSingle();
  if (result.error) throw new Error("Unable to load seller application.");
  if (!result.data) notFound();
  const seller = result.data as SellerApplication;
  const { error, success } = await searchParams;
  const checks = sellerVerificationChecks(seller);
  const ready = checks.every(check => check.complete) && Boolean(seller.legal_name?.trim() && seller.country_code && seller.phone_number && seller.submitted_at);
  return <div className="min-h-screen bg-slate-100 text-slate-900"><div className="mx-auto flex max-w-[1500px] flex-col lg:flex-row"><AdminSidebar /><main className="min-w-0 flex-1 p-4 sm:p-8">
    <Link href="/admin/sellers" className="text-sm font-bold text-blue-600">← Seller applications</Link><h1 className="mt-4 break-all text-3xl font-black">{seller.username}</h1><p className="mt-2 font-bold text-slate-600">{seller.status}</p>
    {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-4 text-red-700">{error}</p>}{success && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-4 text-emerald-700">{success}</p>}
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-black">Application details</h2><dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2">{[["Legal name", seller.legal_name], ["Live face-match score", seller.didit_environment === "live" && seller.didit_face_score != null ? String(seller.didit_face_score) + " / 100" : "Not verified"], ["Country", seller.country_code], ["Full address", [seller.address_line1, seller.address_line2, seller.city, seller.district, seller.state_region, seller.postal_code].filter(Boolean).join(", ") || "Not provided"], ["Mobile number", seller.phone_number], ["Submission connection IP", seller.submission_ip ?? "Unavailable (local or unconfigured hosting)"], ["Sells on other marketplaces", seller.sells_on_other_marketplaces ? "Yes — statement required" : "No"], ["Submitted", seller.submitted_at ? new Date(seller.submitted_at).toLocaleString("en-IN") : "Not submitted"]].map(([label, value]) => <div key={label}><dt className="text-slate-500">{label}</dt><dd className="mt-1 break-words font-bold">{value ?? "—"}</dd></div>)}</dl></section>
    {seller.marketplace_proof_path && <a href={`/admin/sellers/${seller.id}/proof`} className="mt-5 inline-block rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">Download marketplace proof</a>}
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="text-lg font-black">Required verification</h2><ul className="mt-3 divide-y divide-slate-100">{checks.map(check => <li key={check.label} className="flex justify-between gap-4 py-3 text-sm"><span>{check.label}</span><strong className={check.complete ? "text-emerald-700" : "text-amber-700"}>{check.complete ? "Complete" : "Pending"}</strong></li>)}</ul><p className="mt-3 text-sm text-slate-500">These results come from recorded verification. Live Didit checks require passed ID and liveness results and a face-match score of at least 80. The original physical ID photo is reviewed separately.</p></section>
    <section className="mt-5 rounded-2xl border border-slate-200 bg-white p-5"><h2 className="font-black">Accepted seller declaration</h2><p className="mt-2 text-sm leading-6">{seller.declaration_version === SELLER_DECLARATION_VERSION ? SELLER_DECLARATION : "No matching declaration text is available for this version."}</p><p className="mt-3 text-xs text-slate-500">Version: {seller.declaration_version ?? "Not accepted"} · Accepted: {seller.declaration_accepted_at ? new Date(seller.declaration_accepted_at).toLocaleString("en-IN") : "—"}</p></section>
    {seller.review_note && <p className="mt-5 whitespace-pre-wrap rounded-xl bg-slate-50 p-4 text-sm">Previous feedback: {seller.review_note}</p>}
    {seller.status === "PENDING" && <form action={reviewSellerApplication} className="mt-5 rounded-2xl border border-slate-200 bg-white p-5"><input type="hidden" name="seller_id" value={seller.id} /><label className="block text-sm font-bold">Feedback to seller<textarea name="review_note" maxLength={2000} rows={3} className="mt-2 w-full rounded-xl border border-slate-300 p-3 text-base" placeholder="Required when rejecting an application" /></label><div className="mt-4 flex flex-wrap gap-3"><div><input type="hidden" name="decision" value="APPROVED" /><AuthSubmitButton label="Approve seller" pendingLabel="Saving…" disabled={!ready} className="min-h-12 rounded-xl bg-blue-600 px-5 font-bold text-white disabled:opacity-50" /></div><button type="submit" formAction={async (form: FormData) => { "use server"; form.set("decision", "REJECTED"); await reviewSellerApplication(form); }} className="min-h-12 rounded-xl border border-red-300 px-5 font-bold text-red-700">Reject application</button></div>{!ready && <p className="mt-3 text-sm text-amber-700">Approval is blocked until every required verification is complete.</p>}</form>}
  </main></div></div>;
}
