"use client";

import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import { usePathname } from "next/navigation";

import GoogleAdsTag from "./GoogleAdsTag";
import YandexMetrica from "./YandexMetrica";

export default function StoreTracking() {
  const pathname = usePathname();

  if (pathname.startsWith("/admin")) {
    return null;
  }

  return (
    <>
      <YandexMetrica />
      <GoogleAdsTag />
      <Analytics />
      <SpeedInsights />
    </>
  );
}
