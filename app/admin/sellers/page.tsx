import Link from "next/link";
import AdminSidebar from "../AdminSidebar";
import { requireSellerAdministrator } from "@/lib/seller-access";
import { createAdminClient } from "@/lib/supabase/admin";
export const dynamic = "force-dynamic";
export default async function SellersPage({ searchParams }: { searchParams: Promise<{ status?: string; page?: string }> }) {
  await requireSellerAdministrator();
  const params = await searchParams;
  const statuses = ["ALL", "PENDING", "APPROVED", "REJECTED", "SUSPENDED", "DRAFT"];
  const status = statuses.includes(params.status ?? "") ? params.status! : "ALL";
  const page = Math.max(1, Math.min(100000, Math.floor(Number(params.page) || 1)));
  let query = createAdminClient().from("seller_accounts").select("id,username,legal_name,country_code,status,submitted_at", { count: "exact" }).order("created_at", { ascending: false }).order("id");
  if (status !== "ALL") query = query.eq("status", status);
  const result = await query.range((page - 1) * 25, page * 25 - 1);
  if (result.error) throw new Error("Unable to load seller applications.");
  return <div className="min-h-screen bg-slate-100 text-slate-900"><div className="mx-auto flex max-w-[1500px] flex-col lg:flex-row"><AdminSidebar /><main className="min-w-0 flex-1 p-4 sm:p-8">
    <h1 className="text-3xl font-black">Seller applications</h1><p className="mt-2 text-slate-600">Review seller details and verification before allowing them to sell.</p>
    <form className="my-6 flex flex-wrap items-end gap-3"><label className="text-sm font-bold">Status<select name="status" defaultValue={status} className="mt-2 block min-h-11 rounded-xl border border-slate-300 bg-white px-4">{statuses.map(value => <option key={value} value={value}>{value}</option>)}</select></label><button className="min-h-11 rounded-xl bg-blue-600 px-5 font-bold text-white">Apply</button><Link href="/seller" className="ml-auto py-3 text-sm font-bold text-blue-600">View application page</Link></form>
    <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white"><table className="w-full text-left text-sm"><thead className="bg-slate-50"><tr>{["Seller", "Legal name", "Country", "Status", "Submitted", ""].map((label, i) => <th key={i} className="p-4">{label}</th>)}</tr></thead><tbody>{result.data.map(seller => <tr key={seller.id} className="border-t border-slate-100"><td className="p-4 font-bold">{seller.username}</td><td className="p-4">{seller.legal_name ?? "—"}</td><td className="p-4">{seller.country_code ?? "—"}</td><td className="p-4 font-bold">{seller.status}</td><td className="whitespace-nowrap p-4">{seller.submitted_at ? new Date(seller.submitted_at).toLocaleDateString("en-IN") : "—"}</td><td className="p-4"><Link href={"/admin/sellers/" + seller.id} className="font-bold text-blue-600 underline">Review</Link></td></tr>)}</tbody></table>{!result.data.length && <p className="p-6 text-slate-500">No seller applications found.</p>}</div>
    <div className="mt-4 flex justify-between text-sm"><span>{result.count ?? 0} applications</span><div className="flex gap-4">{page > 1 && <Link href={"?status=" + status + "&page=" + (page - 1)}>Previous</Link>}<span>Page {page}</span>{page * 25 < (result.count ?? 0) && <Link href={"?status=" + status + "&page=" + (page + 1)}>Next</Link>}</div></div>
  </main></div></div>;
}
