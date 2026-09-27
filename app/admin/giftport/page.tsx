import AdminSidebar from "../AdminSidebar";
import { requireGiftPortAdmin } from "@/lib/giftport-admin";
import { getGiftPortStatus } from "@/lib/giftport-relay";
import GiftPortPanel from "./GiftPortPanel";
export const dynamic = "force-dynamic";
export default async function GiftPortPage() {
  await requireGiftPortAdmin();
  let status = null, error = "";
  try { status = await getGiftPortStatus(); }
  catch (e) { error = e instanceof Error ? e.message : "Connection unavailable."; }
  return <div className="min-h-screen bg-white text-slate-900"><div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row">
    <AdminSidebar /><main className="min-w-0 flex-1 p-5 sm:p-8">
      <p className="text-xs font-bold uppercase tracking-widest text-blue-600">Supplier connection</p>
      <h1 className="mt-2 text-3xl font-black">GiftPort</h1>
      <p className="mt-2 text-sm text-slate-600">Connect your account to check your INR wallet balance and available brands.</p>
      <GiftPortPanel initialStatus={status} initialError={error} />
    </main></div></div>;
}
