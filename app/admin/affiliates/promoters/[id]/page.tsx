import Link from "next/link";
import AdminSidebar from "@/app/admin/AdminSidebar";
import { loadAffiliateProfile } from "@/lib/admin-affiliate-profile";
import PromoterProfile from "./PromoterProfile";

export const dynamic = "force-dynamic";

export default async function PromoterProfilePage({params}: {params: Promise<{id:string}>}) {
  const {id} = await params;
  const data = await loadAffiliateProfile(id);
  return <div className="min-h-screen bg-white text-slate-900"><div className="mx-auto flex min-h-screen max-w-[1700px] flex-col lg:flex-row"><AdminSidebar/><main className="min-w-0 flex-1 p-3 sm:p-5">
    <Link href={data.account.status === "APPROVED" ? "/admin/affiliates/approved" : "/admin/affiliates/promoters"} className="inline-flex min-h-[44px] items-center text-sm font-bold text-blue-700">← Promoters</Link>
    <PromoterProfile data={data}/>
  </main></div></div>;
}
