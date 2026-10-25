import Link from "next/link";
import AdminSidebar from "../../AdminSidebar";
import { loadWupexImport } from "../import-actions";
import WupexImportForm from "./WupexImportForm";
export const dynamic = "force-dynamic";
export default async function Page({ searchParams }: { searchParams: Promise<{ ids?: string; q?: string }> }) {
 const params = await searchParams;
 const ids = /^\d+(?:,\d+){0,19}$/.test(params.ids ?? "") ? params.ids!.split(",").map(Number) : [];
 const result = await loadWupexImport(ids, params.q ?? "");
 return <div className="min-h-screen bg-slate-50 text-slate-900"><div className="mx-auto flex max-w-[1500px] flex-col lg:flex-row"><AdminSidebar /><main className="min-w-0 flex-1 p-4 sm:p-8">
 <Link href="/admin/wupex" className="text-sm text-blue-700">← Wupex catalogue</Link><h1 className="my-5 text-2xl font-black">Import Wupex product</h1>
 {result.data ? <WupexImportForm setup={result.data} /> : <p role="alert" className="rounded-xl bg-red-50 p-4 text-red-700">{result.error}</p>}
 </main></div></div>;
}
