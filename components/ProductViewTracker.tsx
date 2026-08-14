"use client";

import { useEffect } from "react";

export default function ProductViewTracker({
  productId,
}: {
  productId: string;
}) {
  useEffect(() => {
    const controller = new AbortController();

    void fetch("/api/product-views", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ productId }),
      keepalive: true,
      signal: controller.signal,
    }).catch(() => {
      // View tracking must never interrupt the storefront.
    });

    return () => controller.abort();
  }, [productId]);

  return null;
}
