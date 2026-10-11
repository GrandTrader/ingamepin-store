"use client";

import Image from "next/image";
import { useState, type SyntheticEvent } from "react";
import { canOptimizeProductImage } from "@/lib/product-image";

export default function ProductImage({ src, alt, sizes, className, priority = false, width = 640, height = 640, onError }: {
  src: string; alt: string; sizes: string; className?: string; priority?: boolean;
  width?: number; height?: number; onError?: (event: SyntheticEvent<HTMLImageElement>) => void;
}) {
  const [failedOptimization, setFailedOptimization] = useState<string | null>(null);
  const optimized = canOptimizeProductImage(src) && failedOptimization !== src;
  return <Image src={src} alt={alt} width={width} height={height} sizes={sizes} className={className}
    unoptimized={!optimized} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : undefined}
    onError={event => {
      // Preserve existing artwork even if optimization is temporarily unavailable.
      if (optimized) setFailedOptimization(src);
      else onError?.(event);
    }} />;
}
