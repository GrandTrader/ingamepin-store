import type { ReactNode } from "react";
import Link from "next/link";

export default function ProductSettingsActions({ slug, children }: { slug: string; children: ReactNode }) {
  return <div className="flex h-fit shrink-0 flex-wrap items-center gap-3">
    <Link href={`/product/${encodeURIComponent(slug)}`} target="_blank" rel="noopener noreferrer" prefetch={false} className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-blue-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
      View product ↗<span className="sr-only"> (opens in a new tab)</span>
    </Link>
    {children}
  </div>;
}
