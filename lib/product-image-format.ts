export const MAX_PRODUCT_IMAGE_BYTES = 10 * 1024 * 1024;

/** Check bytes before passing untrusted input to an image decoder. */
export function rasterImageType(bytes: Uint8Array): string | null {
  const at = (offset: number, text: string) =>
    [...text].every((char, index) => bytes[offset + index] === char.charCodeAt(0));
  if (bytes.length < 12) return null;
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes[0] === 0x89 && at(1, "PNG") && bytes[4] === 13 && bytes[5] === 10 && bytes[6] === 26 && bytes[7] === 10) return "image/png";
  if (at(0, "GIF87a") || at(0, "GIF89a")) return "image/gif";
  if (at(0, "RIFF") && at(8, "WEBP")) return "image/webp";
  return null;
}

export function assertRasterImage(bytes: Uint8Array, contentType?: string) {
  if (!bytes.length || bytes.length > MAX_PRODUCT_IMAGE_BYTES) {
    throw new Error("The product image must be between 1 byte and 10 MB.");
  }
  const detected = rasterImageType(bytes);
  if (!detected || (contentType && detected !== contentType)) {
    throw new Error("Upload a valid JPG, PNG, WebP, or GIF image.");
  }
  return detected;
}
