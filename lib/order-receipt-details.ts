/** The checkout IP belongs to this order; never replace it with a viewer or login IP. */
export function receiptCheckoutIp(value: string | null | undefined) {
  return value?.trim() || "Not recorded";
}

export function formatReceiptDate(value: string | null | undefined) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not recorded";
  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  }).format(date) + " IST";
}
