/** Product face values are denomination x quantity, never the selling price or an FX conversion. */
export type FaceValueItem = {
  denomination?: number | string | null;
  amount?: number | string | null;
  customValue?: number | string | null;
  custom_value?: number | string | null;
  denominationCurrency?: string | null;
  product_options?: { denomination_currency: string | null } | { denomination_currency: string | null }[] | null;
  option_name?: string | null;
  optionName?: string | null;
  quantity: number;
};
export function faceDenomination(item: FaceValueItem): { amount: number; currency: string } | null {
  // Range orders preserve their original amount/currency in this generated option label.
  const snapshot = /^Range - ([0-9]+(?:\.[0-9]+)?) ([A-Z]{3})$/.exec(item.option_name ?? item.optionName ?? "");
  const option = Array.isArray(item.product_options) ? item.product_options[0] : item.product_options;
  const raw = snapshot?.[1] ?? item.customValue ?? item.custom_value ?? item.denomination ?? item.amount;
  const amount = raw === null || raw === undefined || raw === "" ? NaN : Number(raw);
  const currency = (snapshot?.[2] ?? item.denominationCurrency ?? option?.denomination_currency ?? "").trim().toUpperCase();
  if (!Number.isFinite(amount) || amount <= 0 || !/^[A-Z]{3}$/.test(currency)) return null;
  return { amount, currency };
}
export function faceValueTotals(items: FaceValueItem[]) {
  const totals = new Map<string, number>();
  let unspecified = 0;
  for (const item of items) {
    const face = faceDenomination(item);
    const quantity = Number(item.quantity);
    const minor = face ? Math.round((face.amount + Number.EPSILON) * 100) * quantity : NaN;
    if (!face || !Number.isSafeInteger(quantity) || quantity <= 0 || !Number.isSafeInteger(minor)) { unspecified++; continue; }
    const sum = (totals.get(face.currency) ?? 0) + minor;
    if (!Number.isSafeInteger(sum)) { unspecified++; continue; }
    totals.set(face.currency, sum);
  }
  return { totals: [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([currency, minor]) => ({currency, amount: minor / 100})), unspecified };
}
export function formatFaceValue(items: FaceValueItem[]) {
  const {totals, unspecified} = faceValueTotals(items);
  const parts = totals.map(({amount, currency}) => `${currency} ${amount.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
  if (unspecified) parts.push(totals.length ? "some items not specified" : "Not specified");
  return parts.join(" · ") || "—";
}
export type FaceValueDraft = FaceValueItem & { productName?: string; editionName?: string };
export function quoteFaceItem(quote: {productName: string; optionName: string; quantity: number}, draft: FaceValueDraft[]): FaceValueItem {
  if (faceDenomination(quote)) return quote;
  // Quote rows may be reordered by the server. Never associate face values by array position.
  const matches = draft.filter(item => item.productName === quote.productName && item.editionName === quote.optionName);
  const values = matches.map(faceDenomination);
  const first = values[0];
  if (!first || values.some(value => !value || value.amount !== first.amount || value.currency !== first.currency)) return quote;
  return {denomination: first.amount, denominationCurrency: first.currency, quantity: quote.quantity};
}
