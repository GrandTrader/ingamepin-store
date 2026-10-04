import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {title:"Affiliate link expired | InGamePin",robots:{index:false,follow:false}};

export default function ExpiredAffiliateLinkPage() {
  return <section className="mx-auto my-8 w-full max-w-xl px-4"><div className="rounded-2xl border border-amber-200 bg-white p-6 shadow-sm">
    <p className="text-sm font-bold text-amber-700">Link expired</p>
    <h1 className="mt-2 text-2xl font-black text-slate-900">This affiliate link has expired</h1>
    <p className="mt-3 text-sm leading-6 text-slate-600">Please ask the person who shared this link for their new product link.</p>
    <div className="mt-5 rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><h2 className="font-bold">Are you the promoter?</h2><p className="mt-1">Open your affiliate account, copy a new link for this product, and replace the old link wherever you shared it.</p></div>
    <Link href="/account/affiliate" className="mt-5 inline-flex min-h-[44px] items-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white">Get new affiliate links</Link>
  </div></section>;
}
