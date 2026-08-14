"use client";

import { useEffect } from "react";

type AffiliateReferralTrackerProps = {
  affiliateCode: string;
  productId: string;
};

export default function AffiliateReferralTracker({
  affiliateCode,
  productId,
}: AffiliateReferralTrackerProps) {
  useEffect(() => {
    if (!affiliateCode || !productId) {
      return;
    }

    const controller = new AbortController();

    void fetch("/api/affiliate/visit", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        affiliateCode,
        productId,
        landingPath: `${window.location.pathname}${window.location.search}`,
        referrerUrl: document.referrer || null,
      }),
      credentials: "same-origin",
      cache: "no-store",
      signal: controller.signal,
    }).catch(() => {
      // Referral tracking must never interrupt the product page.
    });

    return () => controller.abort();
  }, [affiliateCode, productId]);

  return null;
}
