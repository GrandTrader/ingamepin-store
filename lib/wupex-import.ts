import { fkSellingPrice, prepareFKDraft, type FKImportInput } from "./fkwallet-import";
import type { FKProduct } from "./fkwallet-types";
import type { WupexProduct, WupexCatalogFilterSelection } from "./wupex-types";
import type { WupexField } from "./wupex-api";
export { fkSellingPrice as wupexSellingPrice, fkUuid as wupexUuid } from "./fkwallet-import";
export type WupexImportInput = Omit<FKImportInput, "supplierCategoryId"> & { query: string; catalogFilters?: WupexCatalogFilterSelection };
export type WupexImportProduct = WupexProduct & { fields: WupexField[] };
/** Wupex faceValue is a converted account value, not the printed card value.
 * Only use an explicit currency and amount from the supplier product name.
 * Unknown/ambiguous names require an administrator to enter both fields.
 */
const cardCurrencies = new Set(Intl.supportedValuesOf("currency"));
export function wupexCardDenomination(product: Pick<WupexProduct, "name">): { denomination: string; currency: string } | null {
  const name = product.name.toUpperCase().replace(/(?<![A-Z])TL(?![A-Z0-9])/g, " TRY ").replace(/[€₹₺₽£]/g, symbol => ({ "€": " EUR ", "₹": " INR ", "₺": " TRY ", "₽": " RUB ", "£": " GBP " })[symbol]!);
  // A range or bonus bundle cannot safely be interpreted as one fixed value.
  if (/\d[\d,.]*\s*[-–+\/]\s*\d/.test(name)) return null;
  const matches: { amount: string; currency: string }[] = [];
  for (const match of name.matchAll(/(?<![A-Z0-9.,])([0-9][0-9,.]*)\s*([A-Z]{3})(?![A-Z])/g)) matches.push({ amount: match[1], currency: match[2] });
  for (const match of name.matchAll(/(?<![A-Z])([A-Z]{3})\s*([0-9][0-9,.]*)(?![A-Z0-9.,])/g)) matches.push({ amount: match[2], currency: match[1] });
  const values = new Map<string, { denomination: string; currency: string }>();
  for (const { amount, currency } of matches) {
    if (!cardCurrencies.has(currency)) continue;
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,4})?$/.test(amount)) return null;
    const value = Number(amount.replaceAll(",", ""));
    if (!Number.isFinite(value) || value <= 0 || value > 1e9) return null;
    const denomination = String(value);
    values.set(denomination + " " + currency, { denomination, currency });
  }
  return values.size === 1 ? [...values.values()][0] : null;
}

export function prepareWupexDraft(input: WupexImportInput, products: WupexImportProduct[], supplierCurrency: string) {
  if (supplierCurrency !== "USD") throw new Error("Wupex supplier prices need a verified USD account.");
  if (new Set(products.map(p => p.cardType)).size !== 1 || new Set(products.map(p => p.subType)).size !== 1) throw new Error("Import products with the same delivery type together.");
  for (const option of input.options) {
    const product = products.find(p => p.id === option.id);
    const card = product ? wupexCardDenomination(product) : null;
    if (card && (Number(option.denomination) !== Number(card.denomination) || option.currency !== card.currency))
      throw new Error(`The denomination must match ${card.denomination} ${card.currency} shown in the Wupex product name.`);
  }
  const adapted: FKProduct[] = products.map(p => ({
    ...p, currency: "USD", description: "", help: "", params: [], priceType: "FIXED", productType: "DEFAULT",
    fields: p.fields.map(f => ({ key: f.key, label: f.label, placeholder: f.placeholder, type: "text", values: [], info: [], hasChoices: false })),
  }));
  const result = prepareFKDraft({ ...input, supplierCategoryId: 1 }, adapted);
  if (products.some(p => p.cardType === "topup" && !p.fields.length)) throw new Error("Top-ups require a verified recipient form.");
  if (result.options.some(o => o.price !== fkSellingPrice(o.supplierCost, "1", input.markup))) throw new Error("Use the saved markup to calculate every selling price.");
  return result;
}
