import "server-only";
import { definitePlayRequest } from "./definiteplay-relay";
import { getOpenValuePreview } from "./definiteplay-open-value-preview";
import { parseOpenValueSnapshot } from "./definiteplay-open-value";

export async function getOpenValueConnection() {
  try {
    const response = await definitePlayRequest<{ checkedAt: string; products: unknown[]; stale: boolean; rangeReady: boolean }>("open-catalogue");
    const data = parseOpenValueSnapshot({ ...response, catalogueStatus: 200 });
    const age = Date.now() - Date.parse(data.checkedAt);
    return { ...data, preview: false, ready: response.rangeReady === true && response.stale === false && age >= -60000 && age < 900000 };
  } catch {
    if (process.env.NODE_ENV === "development") return { ...await getOpenValuePreview(), preview: true, ready: false };
    throw new Error("Custom-value supplier catalogue is unavailable. Refresh the supplier connection and try again.");
  }
}
