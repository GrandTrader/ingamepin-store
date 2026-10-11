// Only public, known artwork sources are sent through the image optimizer.
export function productImageRemotePatterns(storageUrl = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  const patterns = [
    { protocol: "https" as const, hostname: "image.api.playstation.com", port: "", pathname: "/vulcan/**", search: "" },
    { protocol: "https" as const, hostname: "res.cloudinary.com", port: "", pathname: "/as4zd5aj/image/upload/**", search: "" },
  ];
  try {
    const url = new URL(storageUrl ?? "");
    if (url.protocol === "https:" && url.hostname.endsWith(".supabase.co") && !url.port && !url.username && !url.password) {
      patterns.push({ protocol: "https", hostname: url.hostname, port: "", pathname: "/storage/v1/object/public/store-images/**", search: "" });
    }
  } catch { /* Missing storage configuration leaves external images untouched. */ }
  return patterns;
}

export function canOptimizeProductImage(source: string) {
  try {
    const url = new URL(source, "https://www.ingamepin.com");
    if (url.username || url.password || url.search || url.hash || /\.(svg|gif)$/i.test(url.pathname)) return false;
    if (source.startsWith("/images/") && !source.includes("\\")) return url.origin === "https://www.ingamepin.com" && url.pathname.startsWith("/images/");
    return productImageRemotePatterns().some(pattern =>
      url.protocol === `${pattern.protocol}:` && url.hostname === pattern.hostname && url.port === pattern.port &&
      url.pathname.startsWith(pattern.pathname.slice(0, -2)),
    );
  } catch { return false; }
}
