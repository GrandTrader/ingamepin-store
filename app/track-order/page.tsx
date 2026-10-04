import Link from "next/link";
import PurchaseVerification from "@/components/PurchaseVerification";
import { purchasePage, validOrderReference } from "@/lib/purchase-navigation";

export const metadata = { title: "Your purchases", robots: { index: false, follow: false } };

export default async function TrackOrderPage({ searchParams }: { searchParams: Promise<{ order?: string; page?: string }> }) {
  const query = await searchParams;
  return <main className="track-order-page min-h-screen bg-slate-950 px-4 py-6 text-white sm:py-8">
    <div className="mx-auto max-w-5xl">
      <Link href="/" className="inline-flex min-h-11 items-center text-sm font-bold text-cyan-400">← Return to store</Link>
      <div className="mb-5 mt-3"><h1 className="text-2xl font-black sm:text-3xl">Your Purchases</h1><p className="mt-2 text-sm text-slate-400">Open an order to view delivery details and copy your codes.</p></div>
      <PurchaseVerification requestedOrder={validOrderReference(query.order)} initialPage={purchasePage(query.page)} />
    </div>
  </main>;
}
