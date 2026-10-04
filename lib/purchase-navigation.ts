export function validOrderReference(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const reference = value.trim().toUpperCase();
  return /^[A-Z0-9_-]{8,100}$/.test(reference) ? reference : undefined;
}

export function purchasePage(value: unknown) {
  const page = typeof value === "string" ? Number(value) : 1;
  return Number.isSafeInteger(page) && page > 0 && page <= 10000 ? page : 1;
}

export function purchaseHref(orderNumber: string, page = 1) {
  return `/track-order/${encodeURIComponent(orderNumber)}${page > 1 ? `?page=${page}` : ""}`;
}
