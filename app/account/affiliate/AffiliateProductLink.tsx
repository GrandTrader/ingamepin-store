"use client";

import { useEffect, useState } from "react";
import { setAffiliateProductCommission } from "./actions";

type AffiliateProductLinkProps = {
  affiliateCode: string;
  productId: string;
  productName: string;
  productSlug: string;
  maximumCommissionPercent: number;
  selectedCommissionPercent: number;
};

export default function AffiliateProductLink({
  affiliateCode,
  productId,
  productName,
  productSlug,
  maximumCommissionPercent,
  selectedCommissionPercent,
}: AffiliateProductLinkProps) {
  const path = `/product/${encodeURIComponent(productSlug)}?ref=${encodeURIComponent(
    affiliateCode,
  )}`;
  const [link, setLink] = useState(`https://www.ingamepin.com${path}`);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLink(`${window.location.origin}${path}`);
  }, [path]);

  async function copyLink() {
    await navigator.clipboard.writeText(link);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <article className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-black text-slate-900">{productName}</h3>
          <p className="mt-1 text-xs font-bold text-emerald-700">
            Maximum {maximumCommissionPercent}% commission
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={link}
          aria-label={`Affiliate link for ${productName}`}
          className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-600"
        />
        <button
          type="button"
          onClick={copyLink}
          className="rounded-lg bg-cyan-500 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-cyan-400"
        >
          {copied ? "Copied" : "Copy link"}
        </button>
      </div>

      <form
        action={setAffiliateProductCommission}
        className="mt-3 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-end"
      >
        <input type="hidden" name="product_id" value={productId} />
        <label className="min-w-0 flex-1">
          <span className="text-xs font-bold text-slate-600">Your commission</span>
          <div className="mt-1 flex overflow-hidden rounded-lg border border-slate-300 focus-within:border-cyan-500">
            <input
              name="commission_percent"
              type="number"
              min="0.01"
              max={maximumCommissionPercent}
              step="0.01"
              required
              defaultValue={selectedCommissionPercent}
              className="min-w-0 flex-1 px-3 py-2 outline-none"
            />
            <span className="bg-slate-50 px-3 py-2 text-sm font-black text-slate-500">%</span>
          </div>
        </label>
        <button
          type="submit"
          className="rounded-lg border border-cyan-500 px-4 py-2 text-sm font-black text-cyan-700 transition hover:bg-cyan-50"
        >
          Save rate
        </button>
      </form>
    </article>
  );
}
