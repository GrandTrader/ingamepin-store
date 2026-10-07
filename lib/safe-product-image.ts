import "server-only";
import { assertRasterImage, MAX_PRODUCT_IMAGE_BYTES } from "./product-image-format";

const imageTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

/** Only image storage origins already used by this store; never an arbitrary URL. */
export function trustedProductImageUrl(value: string): URL {
  const message = "Upload this image in the Gallery tab before syncing it to DigiSeller.";
  let url: URL;
  try { url = new URL(value, "https://www.ingamepin.com"); } catch { throw new Error(message); }
  if (url.protocol !== "https:" || url.username || url.password || url.port) throw new Error(message);
  const paths = new Map([
    ["https://www.ingamepin.com", "/images/"],
    ["https://ingamepin.com", "/images/"],
    ["https://res.cloudinary.com", "/as4zd5aj/image/upload/"],
    ["https://image.api.playstation.com", "/vulcan/"],
  ]);
  try {
    const storage = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
    if (storage.protocol === "https:" && storage.hostname.endsWith(".supabase.co") && !storage.port && !storage.username && !storage.password) {
      paths.set(storage.origin, "/storage/v1/object/public/store-images/");
    }
  } catch { /* A missing storage configuration cannot expand the allowlist. */ }
  const prefix = paths.get(url.origin);
  if (!prefix || !url.pathname.startsWith(prefix) || url.pathname.length === prefix.length) throw new Error(message);
  return url;
}

export async function downloadProductImage(value: string, signal?: AbortSignal): Promise<Buffer> {
  const url = trustedProductImageUrl(value);
  const boundedSignal = signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000);
  const response = await fetch(url, { cache: "no-store", redirect: "error", credentials: "omit", signal: boundedSignal });
  const contentType = response.headers.get("content-type")?.split(";")[0].trim().toLowerCase() ?? "";
  const length = Number(response.headers.get("content-length"));
  if (!response.ok || !imageTypes.has(contentType) || length > MAX_PRODUCT_IMAGE_BYTES || !response.body) {
    await response.body?.cancel();
    throw new Error("Unable to download a JPG, PNG, WebP, or GIF image smaller than 10 MB. Upload it in the Gallery tab.");
  }
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  const cancel = () => { void reader.cancel().catch(() => {}); };
  boundedSignal.addEventListener("abort", cancel, { once: true });
  try {
    while (true) {
      boundedSignal.throwIfAborted();
      const { done, value: chunk } = await reader.read();
      boundedSignal.throwIfAborted();
      if (done) break;
      size += chunk.byteLength;
      if (size > MAX_PRODUCT_IMAGE_BYTES) throw new Error("The product image must be smaller than 10 MB.");
      chunks.push(chunk);
    }
    const bytes = Buffer.concat(chunks, size);
    assertRasterImage(bytes, contentType);
    return bytes;
  } finally {
    boundedSignal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
