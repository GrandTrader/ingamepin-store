import type { GiftPortItem } from "./giftport-types";

export type GiftPortImportInput = {
  requestId: string; categoryId: string; operatorCode: string;
  title: string; titleRu: string; description: string; descriptionRu: string;
  options: { amount: string; price: string }[];
};
export function giftPortAmount(value: unknown): string {
  if (typeof value !== "string" || !/^\d{1,9}(?:\.\d{1,2})?$/.test(value) || Number(value) <= 0) throw new Error("Enter a positive denomination with at most two decimals.");
  return Number(value).toFixed(2);
}
export function giftPortAmountAllowed(item: GiftPortItem, value: unknown): boolean {
  let amount: string;
  try { amount = giftPortAmount(value); } catch { return false; }
  if (item.currency !== "INR") return false;
  if (!item.denominationsIncomplete && item.denominations.includes(amount)) return true;
  return item.variable === true && !!item.variableRange &&
    Number(amount) >= Number(item.variableRange.min) && Number(amount) <= Number(item.variableRange.max);
}
function text(value: unknown, label: string, min: number, max: number) {
  if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) throw new Error(`${label} must contain ${min}–${max} characters.`);
  return value.trim();
}
export function prepareGiftPortDraft(input: GiftPortImportInput, item: GiftPortItem) {
  if (!input || input.operatorCode !== item.operatorCode || item.currency !== "INR") throw new Error("Choose a confirmed INR brand from the current GiftPort catalogue.");
  const title = text(input.title, "English title", 2, 150);
  const titleRu = text(input.titleRu, "Russian title", 0, 150);
  const description = text(input.description, "Description", 0, 5000);
  const descriptionRu = text(input.descriptionRu, "Russian description", 0, 5000);
  if (!Array.isArray(input.options) || input.options.length < 1 || input.options.length > 50) throw new Error("Select between 1 and 50 denominations.");
  const seen = new Set<string>();
  const options = input.options.map(row => {
    const amount = giftPortAmount(row?.amount);
    if (seen.has(amount)) throw new Error("Select each denomination only once.");
    seen.add(amount);
    if (!giftPortAmountAllowed(item, amount)) throw new Error(`INR ${amount} is not confirmed for this brand. Refresh the catalogue.`);
    if (!Number.isSafeInteger(Number(amount))) throw new Error("Website denominations must be whole numbers; do not round fractional values.");
    if (typeof row.price !== "string" || !/^\d{1,7}(?:\.\d{1,2})?$/.test(row.price) || Number(row.price) < 0.01) throw new Error("Enter a USD selling price between 0.01 and 9,999,999.99 for every selected option.");
    return { amount, denomination: Number(amount), price: Number(Number(row.price).toFixed(2)), name: `${item.brandName} — INR ${amount}`.slice(0, 150) };
  });
  return { title, titleRu, description, descriptionRu, region: item.country?.trim().slice(0, 100) || "India", options };
}
