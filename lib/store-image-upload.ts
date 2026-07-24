import { randomUUID } from "node:crypto";

import { createAdminClient } from "@/lib/supabase/admin";

const allowedTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
]);

const extensions: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export async function uploadStoreImage(
  value: FormDataEntryValue | null,
  folder: "products" | "slides",
) {
  if (!(value instanceof File) || value.size === 0) {
    return null;
  }

  if (!allowedTypes.has(value.type)) {
    throw new Error("Upload a JPG, PNG, WebP, or GIF image.");
  }

  if (value.size > 10 * 1024 * 1024) {
    throw new Error("The image must be smaller than 10 MB.");
  }

  const extension = extensions[value.type];
  const path = `${folder}/${Date.now()}-${randomUUID()}.${extension}`;
  const admin = createAdminClient();
  const upload = await admin.storage
    .from("store-images")
    .upload(path, value, {
      contentType: value.type,
      cacheControl: "31536000",
      upsert: false,
    });

  if (upload.error) {
    throw new Error(`Unable to upload image: ${upload.error.message}`);
  }

  return admin.storage.from("store-images").getPublicUrl(path).data.publicUrl;
}
