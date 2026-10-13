import "server-only";
import { getDigiSellerToken } from "./digiseller-api";
import { createAdminClient } from "./supabase/admin";
import { readPriceSnapshots, writePriceSnapshots } from "./digiseller-price-api";
import { cents, denominationParameter, variantPrice, type PriceSnapshot } from "./digiseller-pricing";
import { playstationStock, PLAYSTATION_LISTING_ID, PLAYSTATION_PRODUCT_ID } from "./digiseller-playstation-stock";

const checkUrl = "https://www.ingamepin.com/api/digiseller/stock-check?format=json";
const soldOutMarker = "Automatic stock sync: all PlayStation denominations are sold out.";

export function stockPriceSnapshot(before: PriceSnapshot, counts: Map<number, number>, autoPaused = false): PriceSnapshot {
  const parameter = denominationParameter(before);
  if (!parameter || new Set(parameter.variants.map(v => v.variant_id)).size !== parameter.variants.length
    || [...counts.keys()].some(id => !parameter.variants.some(v => v.variant_id === id))
    || parameter.variants.some(v => v.visible && !counts.has(v.variant_id))) throw new Error("Invalid denomination matches.");
  const available = parameter.variants.filter(v => (counts.get(v.variant_id) ?? 0) > 0);
  // DigiSeller needs a visible zero modifier. Pause the entire listing if empty.
  if (!available.length) return { ...before, enabled: false };
  const base = Math.min(...available.map(v => variantPrice(before.base,v)));
  const defaultId = available.find(v => v.is_default)?.variant_id ?? [...available].sort((a,b) => a.order-b.order)[0].variant_id;
  return { ...before, base, enabled: before.enabled || autoPaused, parameters: before.parameters.map(p => p.id !== parameter.id ? p : {
    ...p, variants:p.variants.map(v => {
      const delta = cents(variantPrice(before.base,v))-cents(base);
      return { ...v, type:delta < 0 ? "priceminus" : "priceplus", rate:Math.abs(delta)/100,
        visible:(counts.get(v.variant_id) ?? 0) > 0, is_default:v.variant_id === defaultId };
    }),
  }) };
}

export async function syncPlaystationDigiSellerStock() {
  const db = createAdminClient();
  const state = await db.from("digiseller_price_settings").select("sync_token,recovery_snapshot,last_error").eq("product_id", PLAYSTATION_PRODUCT_ID).maybeSingle();
  if (state.error) throw new Error("Price sync state could not be checked.");
  if (state.data?.sync_token || state.data?.recovery_snapshot) return { changed: 0, skipped: true };
  const rows = await playstationStock(db);
  const id = PLAYSTATION_LISTING_ID;
  const [before] = await readPriceSnapshots([id]);
  const parameter = denominationParameter(before);
  if (!parameter || rows.some(o => o.digiseller_option_id !== parameter.id || !o.digiseller_variant_id)
    || new Set(rows.map(o => o.digiseller_variant_id)).size !== rows.length) throw new Error("Connect every denomination before syncing stock.");
  const autoPaused = state.data?.last_error === soldOutMarker;
  const after = stockPriceSnapshot(before, new Map(rows.map(o => [o.digiseller_variant_id!,o.available])), autoPaused);
  const token = (await getDigiSellerToken(AbortSignal.timeout(10000))).token;
  const request = async (method: string, body?: unknown) => {
    const res = await fetch("https://api.digiseller.com/api/products/options/precheck-settings/"+id+"?token="+encodeURIComponent(token), {
      method, headers:{Accept:"application/json","Content-Type":"application/json"},
      body:body === undefined ? undefined : JSON.stringify(body), cache:"no-store", signal:AbortSignal.timeout(10000),
    });
    const result = await res.json();
    if (!res.ok || result.retval !== 0) throw new Error("DigiSeller payment stock check could not be configured.");
    return result.content;
  };
  const precheck = await request("GET");
  if (precheck.precheck_active && precheck.precheck_url !== checkUrl) throw new Error("An existing custom payment check needs review.");
  if (!precheck.precheck_active || precheck.precheck_no_answer !== "stop") {
    const verified = await request("PUT", {precheck_active:true,precheck_url:checkUrl,precheck_no_answer:"stop"});
    if (!verified.precheck_active || verified.precheck_url !== checkUrl || verified.precheck_no_answer !== "stop") throw new Error("DigiSeller has not confirmed the payment stock check.");
  }
  if (JSON.stringify(before) === JSON.stringify(after)) return { changed:0, skipped:false };
  const lock = await db.rpc("begin_digiseller_price_sync", {p_product_id:PLAYSTATION_PRODUCT_ID,p_snapshot:[before]});
  if (lock.error || !lock.data) throw new Error("A DigiSeller update is already running.");
  let started = false, written = false;
  const finish = async (restored:boolean, error:string|null) => {
    const result = await db.rpc("finish_digiseller_price_sync", {p_product_id:PLAYSTATION_PRODUCT_ID,p_token:lock.data,p_percent:0,p_success:false,p_restored:restored,p_error:error});
    if (result.error) throw new Error("Stock update status could not be saved.");
  };
  try {
    const [current] = await readPriceSnapshots([id]);
    if (JSON.stringify(current) !== JSON.stringify(before)) throw new Error("DigiSeller settings changed. Stock sync will retry.");
    started = true;
    // Sales are paused during rebasing; each final denomination price is preserved.
    await writePriceSnapshots([after], {zeroModifierFirst:true});
    written = true;
    await finish(true, !rows.some(o=>o.available>0) && (before.enabled || autoPaused) ? soldOutMarker : null);
    return { changed:1, skipped:false };
  } catch (error) {
    if (written) throw error;
    let restored = !started;
    if (started) {
      try { await writePriceSnapshots([before], {restore:true,zeroModifierFirst:true}); restored = true; }
      catch { restored = false; }
    }
    await finish(restored, restored ? (autoPaused ? soldOutMarker : null) : "Restore previous DigiSeller prices before resuming stock sync.");
    throw error;
  }
}
