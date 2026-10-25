import { fkSellingPrice, prepareFKDraft, type FKImportInput } from "./fkwallet-import";
import type { FKProduct } from "./fkwallet-types";
import type { WupexProduct } from "./wupex-types";
import type { WupexField } from "./wupex-api";
export { fkSellingPrice as wupexSellingPrice, fkUuid as wupexUuid } from "./fkwallet-import";
export type WupexImportInput = Omit<FKImportInput, "supplierCategoryId"> & { query: string };
export type WupexImportProduct = WupexProduct & { fields: WupexField[] };
export function prepareWupexDraft(input: WupexImportInput, products: WupexImportProduct[], supplierCurrency: string) {
  if (supplierCurrency !== "USD") throw new Error("Wupex supplier prices need a verified USD account.");
  if (new Set(products.map(p => p.cardType)).size !== 1 || new Set(products.map(p => p.subType)).size !== 1) throw new Error("Import products with the same delivery type together.");
  for (const option of input.options) {
    const product = products.find(p => p.id === option.id);
    if (product?.faceValue && Number(option.denomination) !== product.faceValue) throw new Error("The denomination must match the Wupex face value.");
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
