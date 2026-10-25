import AdminSidebar from "../AdminSidebar";
import { requireWupexAdmin } from "@/lib/wupex-admin";
import WupexPanel from "./WupexPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "Wupex | InGamePin Admin" };

export default async function WupexPage() {
  await requireWupexAdmin();
  return <div className="min-h-screen bg-slate-50 text-slate-900">
    <div className="mx-auto flex max-w-[1500px] flex-col lg:flex-row">
      <AdminSidebar />
      <main className="min-w-0 flex-1 space-y-5 p-4 sm:p-8">
        <header><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Supplier account</p>
          <h1 className="mt-2 text-3xl font-black">Wupex</h1>
          <p className="mt-2 text-sm text-slate-600">Connect your account and check supplier products, availability and balance.</p>
        </header>
        <WupexPanel />
      </main>
    </div>
  </div>;
}
