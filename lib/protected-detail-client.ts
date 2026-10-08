import { PROTECTED_REFERENCE } from "./sensitive-customer-fields";

// Keep raw values in component memory until this authenticated request encrypts
// them. Only the returned opaque references may enter browser cart storage.
export async function captureProtectedDetails(productId: string, authorized: boolean, units: Record<string, string>[]) {
  const response = await fetch("/api/account/protected-details", {
    method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ productId, authorized, units }),
  });
  const body = await response.json();
  if (!response.ok) throw Error(body.error || "Unable to protect your account details.");
  if (!Array.isArray(body.references) || body.references.length !== units.length) throw Error("Unable to protect your account details.");
  return units.map((unit, index): Record<string, string> => {
    const reference = body.references[index];
    if (!reference || typeof reference !== "object" || Array.isArray(reference)) throw Error("Unable to protect your account details.");
    return Object.fromEntries(Object.entries(unit).filter(([, value]) => value !== "").map(([field]) => {
      if (typeof reference[field] !== "string" || !PROTECTED_REFERENCE.test(reference[field])) throw Error("Unable to protect your account details.");
      return [field, reference[field]];
    }));
  });
}

export const ACCOUNT_PURCHASE_CONSENT = "I own this game account and authorize InGamePin to access it solely to complete this purchase. Passwords and backup codes are encrypted, available only to verified administrators for paid orders, and expire after 24 hours. This is an InGamePin service, not the game platform’s sign-in page.";
