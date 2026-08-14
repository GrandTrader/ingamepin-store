"use client";

import Image from "next/image";

type StoreImageProps = {
  src: string;
  alt: string;
  className?: string;
  sizes: string;
  priority?: boolean;
  onError?: () => void;
};

function isOptimizedStoreImage(src: string) {
  try {
    const storageHost = new URL(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    ).hostname;

    return Boolean(storageHost) && new URL(src).hostname === storageHost;
  } catch {
    return false;
  }
}

export default function StoreImage({
  src,
  alt,
  className,
  sizes,
  priority = false,
  onError,
}: StoreImageProps) {
  if (isOptimizedStoreImage(src)) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        onError={onError}
        className={className}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      fetchPriority={priority ? "high" : "auto"}
      onError={onError}
      className={className}
    />
  );
}
