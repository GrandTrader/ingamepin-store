export const DELIVERY_RECEIPT_MAX_BYTES = 3 * 1024 * 1024;
export const DELIVERY_RECEIPT_BUCKET = "delivery-receipts";

export async function readDeliveryReceipt(file: File) {
  if (!file.size || file.size > DELIVERY_RECEIPT_MAX_BYTES) {
    throw new Error("Choose a receipt between 1 byte and 3 MB.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const starts = (signature: number[]) => signature.every((byte, index) => bytes[index] === byte);
  const format = starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    ? { extension: "png", contentType: "image/png" }
    : starts([0xff, 0xd8, 0xff])
      ? { extension: "jpg", contentType: "image/jpeg" }
      : starts([0x25, 0x50, 0x44, 0x46, 0x2d])
        ? { extension: "pdf", contentType: "application/pdf" }
        : null;
  if (!format || (file.type && file.type !== format.contentType)) {
    throw new Error("Upload a valid JPG, PNG or PDF receipt.");
  }
  return { bytes, ...format };
}
