"use client";

import { useState, type ReactNode } from "react";

import { useStorePreferences } from "./StorePreferences";

type LocalizedProductImageProps = {
  imageUrl: string | null;
  imageUrlRu?: string | null;
  alt: string;
  altRu?: string | null;
  className: string;
  fallback: ReactNode;
};

export default function LocalizedProductImage({
  imageUrl,
  imageUrlRu,
  alt,
  altRu,
  className,
  fallback,
}: LocalizedProductImageProps) {
  const { language } = useStorePreferences();
  const [failedImages, setFailedImages] = useState<string[]>([]);
  const russianImage = language === "ru" ? imageUrlRu : null;
  const source =
    russianImage && !failedImages.includes(russianImage)
      ? russianImage
      : imageUrl && !failedImages.includes(imageUrl)
        ? imageUrl
        : null;

  if (!source) return fallback;

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={source}
      alt={language === "ru" && altRu ? altRu : alt}
      onError={() =>
        setFailedImages((current) =>
          current.includes(source) ? current : [...current, source],
        )
      }
      className={className}
    />
  );
}
