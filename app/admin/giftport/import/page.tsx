import Link from "next/link";
import { randomUUID } from "node:crypto";
import AdminSidebar from "../../AdminSidebar";
import { requireGiftPortAdmin } from "@/lib/giftport-admin";
import { getGiftPortStatus } from "@/lib/giftport-relay";
import GiftPortImportForm from "./GiftPortImportForm";

export const dynamic = "force-dynamic";
export default async function GiftPortImportPage({ searchParams }: { searchParams: Promise<{ code?: string }> }) {
  const session = await requireGiftPortAdmin();
  const { code } = await searchParams;
  const categories = await session.from("categories").select("id,name").eq("is_active", true).order("name");
  let item = null, error = "";
  try {
    if (typeof code !== "string" || !/^[A-Za-z0-9_.-]{1,100}$/.test(code)) throw new Error("Choose a brand from the GiftPort catalogue.");
    const status = await getGiftPortStatus();
    if (!status.configured || status.stale) throw new Error("Refresh the GiftPort catalogue before importing.");
    item = status.snapshot?.items.find(i => i.operatorCode === code) ?? null;
    if (!item || item.currency !== "INR") throw new Error("This brand does not have confirmed INR values.");
    if (categories.error) throw new Error("Unable to load website categories.");
  } catch (e) { error = e instanceof Error ? e.message : "Unable to load import details."; }
  return <div className="min-h-screen bg-slate-50 text-slate-900"><div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row"><AdminSidebar /><main className="min-w-0 flex-1 p-5 sm:p-8">
    <Link href="/admin/giftport" className="font-bold text-blue-700">← GiftPort catalogue</Link><h1 className="mt-4 text-3xl font-black">Import GiftPort product</h1>
    <p className="mt-2 text-slate-600">Create one draft product with your selected INR denominations as its options.</p>
    {error ? <p role="alert" className="mt-6 rounded-xl bg-amber-50 p-4 text-amber-900">{error}</p> : item && <GiftPortImportForm item={item} categories={categories.data || []} requestId={randomUUID()} />}
  </main></div></div>;
}
