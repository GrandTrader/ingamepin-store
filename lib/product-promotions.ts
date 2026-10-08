export type PromotionRule = { optionId: string | null; percent: number; endsAt: string | null };
export type ProductPromotion = { product_id: string; revision: string; rules: PromotionRule[] };
export type PromotionPrice = { price: number; percent: number; endsAt: string | null };
export function cardPromotionPrice(options: PromotionPrice[] | undefined, fallback: number, customer = 0, now = Date.now()) {
  const values=(options?.length?options:[{price:fallback,percent:0,endsAt:null}]).map(o=>{
    const sale=o.endsAt&&Date.parse(o.endsAt)>now?o.percent:0;
    const percent=Math.max(sale,customer);
    return {regular:o.price,price:promotionLineTotal(o.price,sale,customer),percent,sale};
  });
  return values.reduce((a,b)=>a.price<=b.price?a:b);
}
export function activePromotion(rules: PromotionRule[] = [], optionId?: string | null, now = Date.now()): PromotionRule | null {
  // An explicit option override (including an expired one) replaces the product default.
  const rule = rules.find(r => r.optionId === optionId && optionId != null) ?? rules.find(r => r.optionId === null);
  return rule && Number.isFinite(rule.percent) && rule.percent > 0 && rule.percent < 100 &&
    rule.endsAt && Date.parse(rule.endsAt) > now ? rule : null;
}
export function discountedPrice(price: number, percent: number) {
  const cents = Math.round(price * 100), basisPoints = Math.round(Math.max(0, Math.min(100, percent)) * 100);
  return Math.max(price > 0 && percent < 100 ? 0.01 : 0, Math.round(cents * (10000 - basisPoints) / 10000) / 100);
}
// Public sale price is already reduced. Apply only the extra part of a better personal discount.
export function extraCustomerPercent(salePercent: number, customerPercent: number) {
  const sale = Math.max(0, Math.min(99.99, salePercent));
  return Math.max(0, Math.min(100, (Math.max(sale, customerPercent) - sale) * 100 / (100 - sale)));
}
export function promotionLineTotal(regular: number, sale: number, customer: number, quantity = 1) {
  const total = discountedPrice(regular, sale) * quantity;
  return Math.round((total - Math.round(total * extraCustomerPercent(sale, customer)) / 100) * 100) / 100;
}
export function promotionExpiryLabel(value: string) {
  return new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true }).format(new Date(value)) + " IST";
}
export function toIndiaInput(value: string | null) {
  return value ? new Date(Date.parse(value) + 330 * 60000).toISOString().slice(0, 16) : "";
}
export function fromIndiaInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw Error("Choose a valid expiry date and time.");
  const result = new Date(value + ":00+05:30");
  if (!Number.isFinite(result.getTime()) || toIndiaInput(result.toISOString()) !== value) throw Error("Choose a valid expiry date and time.");
  return result.toISOString();
}
export function parsePromotionRules(input: unknown, now = Date.now()): PromotionRule[] {
  if (!Array.isArray(input) || input.length > 201) throw Error("Invalid discount settings.");
  const seen = new Set<string>();
  return input.map((value: unknown) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) throw Error("Invalid discount.");
    const rule = value as Record<string, unknown>;
    const optionId = rule.optionId;
    if (optionId !== null && (typeof optionId !== "string" || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(optionId))) throw Error("Invalid denomination.");
    if (seen.has(String(optionId))) throw Error("Duplicate denomination discount.");
    seen.add(String(optionId));
    const percent = Number(rule.percent);
    if ((typeof rule.percent !== "number" && typeof rule.percent !== "string") || String(rule.percent).trim() === "" ||
      !Number.isFinite(percent) || percent < 0 || percent >= 100 || Math.abs(percent * 100 - Math.round(percent * 100)) > 0.000001) throw Error("Discount must be from 0% to 99.99%, with up to two decimal places.");
    const endsAt = percent === 0 ? null : typeof rule.endsAt === "string" ? rule.endsAt : null;
    if (percent > 0 && (!endsAt || !Number.isFinite(Date.parse(endsAt)))) throw Error("Every discount needs an expiry date and time.");
    // Existing expired rules may be retained while another denomination is edited.
    if (endsAt && Date.parse(endsAt) > now + 3660 * 86400000) throw Error("Expiry must be within ten years.");
    return { optionId, percent, endsAt: endsAt ? new Date(endsAt).toISOString() : null } as PromotionRule;
  });
}
