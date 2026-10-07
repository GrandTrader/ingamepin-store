import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parseOpenValueSnapshot } from "./definiteplay-open-value";

export async function getOpenValuePreview() {
  // This stage uses the verified local export. It must never become a production fallback.
  if (process.env.NODE_ENV !== "development") throw new Error("Local preview is unavailable.");
  try {
    const content = await readFile(join(process.cwd(), "tmp", "definiteplay-preview", "catalogue.json"), "utf8");
    if (content.length > 1_000_000) throw new Error("Catalogue too large.");
    return parseOpenValueSnapshot(JSON.parse(content));
  } catch {
    throw new Error("The local catalogue export is missing or invalid. Refresh the verified supplier export before previewing.");
  }
}
