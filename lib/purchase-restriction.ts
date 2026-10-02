export const purchaseResetPeriods = [
  { value: "ROLLING_1_DAY", label: "1 day (24 hours)", days: 1 },
  { value: "ROLLING_7_DAYS", label: "1 week (7 days)", days: 7 },
  { value: "ROLLING_30_DAYS", label: "1 month (30 days)", days: 30 },
] as const;

export const purchaseLimitMessage = "Purchase limit reached. Please try again after your limit resets.";

export function isPurchaseResetPeriod(value: string): boolean {
  return value === "CALENDAR_WEEK" || purchaseResetPeriods.some(period => period.value === value);
}

// Existing calendar-week rules retain their original Monday/UTC boundary.
export function purchaseLimitSince(mode: string, now = new Date()): Date {
  if (!Number.isFinite(now.getTime())) throw new Error("Invalid purchase limit date.");
  const since = new Date(now);
  if (mode === "CALENDAR_WEEK") {
    since.setUTCDate(since.getUTCDate() - (since.getUTCDay() + 6) % 7);
    since.setUTCHours(0, 0, 0, 0);
    return since;
  }
  const period = purchaseResetPeriods.find(period => period.value === mode);
  if (!period) throw new Error("Unsupported purchase limit reset period.");
  return new Date(since.getTime() - period.days * 24 * 60 * 60 * 1000);
}
