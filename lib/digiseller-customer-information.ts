export type DigiPurchaseOption = { id?: string | number; user_data?: string | number; user_data_id?: string | number };
export type DigiFieldLink = { fieldId: string; optionId: number; fieldType: string };
export type DigiMappedOption = { id: string; product_id: string; digiseller_option_id: number | null; digiseller_variant_id: number | null; denomination?: number | null };

// Numeric user/server IDs are text fields, never denomination selections.
export function resolveDigiSelection(rows: DigiMappedOption[], selections: DigiPurchaseOption[] = []) {
  if (!Array.isArray(selections)) return null;
  const matches = rows.filter(row => {
    if (row.digiseller_option_id == null && row.digiseller_variant_id == null) return rows.length === 1;
    const values = selections.filter(value => Number(value.id) === Number(row.digiseller_option_id));
    if (values.length !== 1) return false;
    const value = values[0];
    if (value.user_data_id != null) return Number(value.user_data_id) === Number(row.digiseller_variant_id);
    return row.denomination != null && String(value.user_data).trim() === String(row.denomination);
  });
  return matches.length === 1 ? matches[0] : null;
}

export function digiRecipientInformation(links: DigiFieldLink[], options: DigiPurchaseOption[]) {
  if (!Array.isArray(links) || !Array.isArray(options) || links.length > 20
    || new Set(links.map(link => link.fieldId)).size !== links.length
    || new Set(links.map(link => link.optionId)).size !== links.length) throw new Error("Customer information links are invalid.");
  return links.map(link => {
    const values = options.filter(option => Number(option.id) === Number(link.optionId));
    if (values.length !== 1 || values[0].user_data_id != null || typeof values[0].user_data !== "string") {
      throw new Error("Required customer information is missing.");
    }
    const value = values[0].user_data.trim();
    if (!value || value.length > 2000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)
      || (link.fieldType === "EMAIL" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))
      || (link.fieldType === "NUMBER" && !/^\d+(?:\.\d+)?$/.test(value))
      || !["TEXT", "EMAIL", "NUMBER", "TEXTAREA"].includes(link.fieldType)) throw new Error("Customer information is invalid.");
    return { fieldId: link.fieldId, value };
  }).sort((a, b) => a.fieldId.localeCompare(b.fieldId));
}

export function digiNetProceeds(purchase: { invoiceState: number; quantity: number; amount: number; amountUsd: number; profit: number | null }) {
  const { invoiceState, quantity, amount, amountUsd, profit } = purchase;
  if (invoiceState !== 3 || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1000
    || !Number.isFinite(amount) || amount <= 0 || !Number.isFinite(amountUsd) || amountUsd <= 0
    || profit === null || !Number.isFinite(profit) || profit <= 0 || profit > amount) throw new Error("Payment is not verified.");
  const net = Math.floor(amountUsd * profit / amount * 1e8) / 1e8;
  if (!Number.isFinite(net) || net <= 0) throw new Error("Payment proceeds are unavailable.");
  return net;
}
