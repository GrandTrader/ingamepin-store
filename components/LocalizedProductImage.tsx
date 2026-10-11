"use client";

import { useState, type ReactNode } from "react";

import ProductImage from "./ProductImage";
import { useStorePreferences } from "./StorePreferences";

type LocalizedProductImageProps = {
  imageUrl: string | null;
  imageUrlRu?: string | null;
  alt: string;
  altRu?: string | null;
  className: string;
  fallback: ReactNode;
  priority?: boolean;
};

export default function LocalizedProductImage({
  imageUrl,
  imageUrlRu,
  alt,
  altRu,
  className,
  fallback,
  priority = false,
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
    <ProductImage
      priority={priority}
      sizes="(max-width: 700px) 100px, 160px"
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
