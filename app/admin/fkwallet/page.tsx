import AdminSidebar from "../AdminSidebar";
import { requireFKAdmin } from "@/lib/fkwallet-admin";
import FKWalletPanel from "./FKWalletPanel";

export const dynamic = "force-dynamic";
export const metadata = { title: "FKWallet | InGamePin Admin" };

export default async function FKWalletPage() {
  await requireFKAdmin();
  return <div className="min-h-screen bg-slate-50 text-slate-900"><div className="mx-auto flex max-w-[1500px] flex-col lg:flex-row">
    <AdminSidebar /><main className="min-w-0 flex-1 space-y-6 p-4 sm:p-8">
      <header><p className="text-xs font-bold uppercase tracking-widest text-blue-600">Supplier account</p><h1 className="mt-2 text-3xl font-black">FKWallet</h1><p className="mt-2 text-slate-600">Digital products, wallet balance and purchase results.</p></header>
      <FKWalletPanel />
    </main>
  </div></div>;
}
