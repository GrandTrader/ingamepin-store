import "server-only";
import type { DefinitePlayCatalogue, DefinitePlayMapping, DefinitePlayStatus } from "./definiteplay-types";

type Endpoint = "status" | "catalogue" | "mappings" | "mapping" | "refresh";

export async function definitePlayRequest<T>(
  endpoint: Endpoint, options: { method?: "GET" | "POST" | "PUT" | "DELETE"; query?: Record<string,string>; body?: unknown } = {},
): Promise<T> {
  const base = process.env.DEFINITEPLAY_RELAY_URL?.trim();
  const secret = process.env.DEFINITEPLAY_RELAY_SECRET?.trim();
  if (!base || !secret) throw new Error("Definite Play connection is not configured.");
  const url = new URL(base.replace(/\/$/, "") + "/" + endpoint);
  if (url.protocol !== "https:" || url.username || url.password) throw new Error("Invalid supplier connection configuration.");
  for (const [key,value] of Object.entries(options.query ?? {})) url.searchParams.set(key,value);
  let response: Response;
  try {
    response = await fetch(url, {
      method: options.method ?? "GET", cache: "no-store", redirect: "error",
      headers: { Authorization: `Bearer ${secret}`, "Content-Type": "application/json" },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: AbortSignal.timeout(12000),
    });
  } catch { throw new Error("Unable to reach Definite Play. Please try again."); }
  if (!response.ok) throw new Error(response.status === 400
    ? "Refresh supplier data and check the selected product."
    : "The supplier connection is unavailable. Please try again.");
  try { return await response.json() as T; }
  catch { throw new Error("The supplier connection returned an invalid response."); }
}

export function getDefinitePlayStatus() {
  return definitePlayRequest<DefinitePlayStatus>("status");
}
export function getDefinitePlayCatalogue(query = "", offset = 0, limit = 30, filters: {category?:string;region?:string;variant?:string} = {}) {
  return definitePlayRequest<DefinitePlayCatalogue>("catalogue", {
    query:{ q:query.slice(0,200),offset:String(offset),limit:String(limit), category:(filters.category??"").slice(0,200), region:(filters.region??"").slice(0,200), variant:filters.variant??"" },
  });
}
export function getDefinitePlayMappings(productId: string) {
  return definitePlayRequest<{mappings:DefinitePlayMapping[]}>("mappings",{query:{productId}});
}

export function getDefinitePlayItems(skus: string[]) {
  if(!Array.isArray(skus) || !skus.length || skus.length>50 || skus.some(s=>typeof s!=="string"||!/^[A-Za-z0-9._-]{1,100}$/.test(s))) {
    throw new Error("Select between 1 and 50 valid supplier items.");
  }
  return definitePlayRequest<DefinitePlayCatalogue>("catalogue", {query:{skus:skus.join(","),limit:"50"}});
}
