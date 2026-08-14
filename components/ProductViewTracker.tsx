"use client";

import { useEffect } from "react";

export default function ProductViewTracker({
  productId,
}: {
  productId: string;
}) {
  useEffect(() => {
    const storageKey = `ingamepin-product-view:${productId}`;

    try {
      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, "1");
    } catch {
      // Tracking still works when session storage is unavailable.
    }

    void fetch("/api/product-views", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ productId }),
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
          // A later page view can retry when storage is available again.
        }
        // View tracking must never interrupt the storefront.
      });
  }, [productId]);

  return null;
}
