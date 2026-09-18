"use client";
import { lazy, Suspense } from "react";
import { usePathname } from "next/navigation";
import { useStorePreferences } from "./StorePreferences";

const Translator = lazy(() => import("./RussianWebsiteTranslator"));
export default function WebsiteTranslator() {
  const { language } = useStorePreferences();
  const pathname = usePathname();
  return language === "en" || pathname.startsWith("/admin") ? null : <Suspense fallback={null}><Translator /></Suspense>;
}
