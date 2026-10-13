import "server-only";
import { getDigiSellerToken, listDigiSellerProducts } from "./digiseller-api";
import { createAdminClient } from "./supabase/admin";
import { playstationStock, PLAYSTATION_LISTING_ID, PLAYSTATION_PRODUCT_ID } from "./digiseller-playstation-stock";

type Variant = { variant_id: number; visible: boolean; is_default: boolean; order: number };
type Parameter = { id: number; type: string; required: boolean; variants: Variant[] };
const checkUrl = "https://www.ingamepin.com/api/digiseller/stock-check?format=json";

export function stockVisibilityPlan(variants: Variant[], counts: Map<number, number>) {
  if (new Set(variants.map(v => v.variant_id)).size !== variants.length
    || [...counts.keys()].some(id => !variants.some(v => v.variant_id === id))) throw new Error("Invalid denomination matches.");
  const available = variants.filter(v => counts.has(v.variant_id) ? counts.get(v.variant_id)! > 0 : v.visible);
  const defaultId = available.find(v => v.is_default)?.variant_id ?? [...available].sort((a,b) => a.order-b.order)[0]?.variant_id;
  return variants.map(v => ({ ...v, visible: counts.has(v.variant_id) ? counts.get(v.variant_id)! > 0 : v.visible,
    is_default: v.variant_id === defaultId }));
}

export async function syncPlaystationDigiSellerStock() {
  const db = createAdminClient();
  const lock = await db.from("digiseller_price_settings").select("sync_token,recovery_snapshot").eq("product_id", PLAYSTATION_PRODUCT_ID).maybeSingle();
  if (lock.error) throw new Error("Price sync state could not be checked.");
  if (lock.data?.sync_token || lock.data?.recovery_snapshot) return { changed: 0, skipped: true };
  const rows = await playstationStock(db);
  const id = PLAYSTATION_LISTING_ID;
  const token = (await getDigiSellerToken(AbortSignal.timeout(10000))).token;
  if (!(await listDigiSellerProducts(AbortSignal.timeout(15000))).some(p => p.id === id)) throw new Error("PlayStation listing does not belong to this account.");
  const request = async (path: string, method = "GET", body?: unknown) => {
    const res = await fetch(`https://api.digiseller.com${path}?token=${encodeURIComponent(token)}`, {
      method, headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(10000),
    });
    const result = await res.json();
    if (!res.ok || result.retval !== 0) throw new Error("DigiSeller stock update failed.");
    return result.content;
  };
  const parameters = await request(`/api/products/options/list/${id}`) as { id: number; type: string }[];
  const selectors = parameters.filter(p => !["text", "textarea"].includes(p.type));
  if (selectors.length !== 1 || !["radio", "select"].includes(selectors[0].type)) throw new Error("PlayStation denomination selector has changed.");
  const parameter = await request(`/api/products/options/${selectors[0].id}`) as Parameter;
  if (!parameter.required || !Array.isArray(parameter.variants)) throw new Error("A required denomination selector is missing.");
  if (rows.some(o => o.digiseller_option_id !== parameter.id || !o.digiseller_variant_id)
    || new Set(rows.map(o => o.digiseller_variant_id)).size !== rows.length
    || parameter.variants.some(v => v.visible && !rows.some(o => o.digiseller_variant_id === v.variant_id))) throw new Error("Connect every visible denomination before syncing stock.");
  const plan = stockVisibilityPlan(parameter.variants, new Map(rows.map(o => [o.digiseller_variant_id!, o.available])));
  const precheck = await request(`/api/products/options/precheck-settings/${id}`);
  if (precheck.precheck_active && precheck.precheck_url !== checkUrl) throw new Error("An existing custom payment check needs review.");
  if (!precheck.precheck_active || precheck.precheck_no_answer !== "stop") {
    await request(`/api/products/options/precheck-settings/${id}`, "PUT", { precheck_active: true, precheck_url: checkUrl, precheck_no_answer: "stop" });
  }
  let changed = 0;
  // Only visibility/default changes; prices, names, order and modifiers are omitted.
  for (const target of [...plan].sort((a,b) => Number(b.is_default)-Number(a.is_default))) {
    const old = parameter.variants.find(v => v.variant_id === target.variant_id)!;
    if (old.visible === target.visible && old.is_default === target.is_default) continue;
    await request(`/api/products/options/${parameter.id}/variants/${target.variant_id}`, "POST", { visible: target.visible, default: target.is_default });
    changed++;
  }
  const verified = await request(`/api/products/options/${parameter.id}`) as Parameter;
  if (plan.some(v => !verified.variants.some(g => g.variant_id === v.variant_id && g.visible === v.visible && g.is_default === v.is_default))) throw new Error("DigiSeller has not confirmed the stock visibility update.");
  return { changed, skipped: false };
}
