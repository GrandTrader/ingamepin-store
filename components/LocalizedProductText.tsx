"use client";

import { useStorePreferences } from "./StorePreferences";

export default function LocalizedProductText({
  english,
  russian,
}: {
  english: string;
  russian?: string | null;
}) {
  const { language } = useStorePreferences();

  return <>{language === "ru" && russian ? russian : english}</>;
}
