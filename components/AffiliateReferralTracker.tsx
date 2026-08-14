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

    const storageKey = `ingamepin-affiliate-visit:${affiliateCode}:${productId}`;

    try {
      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // Referral tracking still works when session storage is unavailable.
    }

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
      keepalive: true,
    })
      .then((response) => {
        if (!response.ok) {
          window.sessionStorage.removeItem(storageKey);
        }
      })
      .catch(() => {
        try {
          window.sessionStorage.removeItem(storageKey);
        } catch {
          // A later referral visit can retry when storage is available again.
        }
        // Referral tracking must never interrupt the product page.
      });
  }, [affiliateCode, productId]);

  return null;
}
