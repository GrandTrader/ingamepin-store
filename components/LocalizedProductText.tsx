"use client";

import { useStorePreferences } from "./StorePreferences";

function hasBrokenEncoding(value: string) {
  return /(?:Ã|Â|Ð|Ñ|â€|â€“|â€”|â†)/.test(value);
}

export default function LocalizedProductText({
  english,
  russian,
}: {
  english: string;
  russian?: string | null;
}) {
  const { language } = useStorePreferences();

  return <>{language === "ru" && russian && !hasBrokenEncoding(russian) ? russian : english}</>;
}
