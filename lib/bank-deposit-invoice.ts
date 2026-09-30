export type BankDepositInvoice = {
  id: string;
  invoice_number: string;
  amount_usd: number | string;
  buyer: { name: string; address: string; country: string; registration_number: string; email: string };
  bank_instructions: Record<string, string>;
  created_at: string;
};
export const bankInvoiceId = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
export function bankInvoiceAmount(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,5}(\.\d{1,2})?$/.test(value)) return null;
  const amount = Number(value);
  return amount >= 10 && amount <= 50000 ? amount : null;
}
