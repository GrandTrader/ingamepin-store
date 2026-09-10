import {diditConfig} from "@/lib/didit-config";
import { createAdminClient } from "@/lib/supabase/admin";
import SellerIdentityPanel from "./SellerIdentityPanel";
import Link from "next/link";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { sellerVerificationChecks, type SellerApplication } from "@/lib/seller-application";
import SellerApplicationForm from "./SellerApplicationForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Seller application", robots: { index: false, follow: false } };
export default async function SellerPage() {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return <div className="mx-auto my-12 w-full max-w-xl rounded-2xl border border-slate-200 bg-white p-6 text-slate-900"><h1 className="text-2xl font-black">Become an InGamePin seller</h1><p className="mt-3 text-slate-600">Sign in or create a customer account, then return here to apply as a seller.</p><div className="mt-6 flex gap-4"><Link href="/account" className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white">Sign in</Link><Link href="/account/register" className="rounded-xl border border-slate-300 px-5 py-3 font-bold">Create account</Link></div></div>;
  const result = await session.from("seller_accounts").select("*").eq("user_id", user.id).maybeSingle();
  if (result.error) throw new Error("Unable to load your seller application. Please try again.");
  const seller = result.data as SellerApplication | null;
  const identityConfig = diditConfig();
  let identitySummary = null;
  if (seller?.status === "PENDING" && identityConfig.workflow) {
    const identity = await createAdminClient().from(identityConfig.table).select("provider_status,face_score,checks_passed,session_id").eq("seller_id",seller.id).eq("application_submitted_at",seller.submitted_at).eq("workflow_id",identityConfig.workflow!).maybeSingle();
    identitySummary = identity.data;
  }
  const editable = !seller || ["DRAFT", "REJECTED"].includes(seller.status);
  return <div className="bg-slate-100 px-4 py-8 text-slate-900 sm:py-12"><div className="mx-auto max-w-3xl">
    <Link href="/account/dashboard" className="text-sm font-bold text-blue-600">← My account</Link>
    <h1 className="mt-4 text-3xl font-black">{editable ? "Seller application" : "Your seller application"}</h1>
    <p className="mt-2 text-slate-600">Create your seller profile. Verification and admin approval are required before selling.</p>
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 sm:p-8">
      <p className="mb-5 break-all text-sm text-slate-600">Account email: <strong>{user.email}</strong> · {user.email_confirmed_at ? "Verified" : "Not verified"}</p>
      {seller && <div className="mb-6 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="font-black">{seller.username} · {seller.status}</p>{seller.review_note && <p className="mt-2 whitespace-pre-wrap text-sm">Admin feedback: {seller.review_note}</p>}</div>}
      {editable ? <SellerApplicationForm application={seller} /> : <><h2 className="text-lg font-black">Verification progress</h2><ul className="mt-3 divide-y divide-slate-100">{sellerVerificationChecks(seller!).map(check => <li key={check.label} className="flex justify-between gap-4 py-3 text-sm"><span>{check.label}</span><strong className={check.complete ? "text-emerald-700" : "text-amber-700"}>{check.complete ? "Complete" : "Pending"}</strong></li>)}</ul><p className="mt-4 text-sm text-slate-600">{seller?.status === "APPROVED" ? "Your seller application is approved. Product listing and payouts are not available yet." : seller?.status === "SUSPENDED" ? "Your seller account is suspended. Contact support for assistance." : "Your application has been received. Selling stays disabled until verification and admin approval are complete."}</p></>}
      {seller?.status === "PENDING" && <SellerIdentityPanel summary={identitySummary} live={identityConfig.live} />}
    </section>
    <p className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-6 text-amber-900">Marketplace proof is required when you already sell elsewhere. Identity verification is available after application submission. The separate photo holding your original ID still requires its own review; final seller approval remains manual. Do not send identity documents through ordinary chat or email.</p>
  </div></div>;
}
