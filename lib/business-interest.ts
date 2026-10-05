import { countryCallingCodes } from "./countryCallingCodes";

export const businessInterests = [["B2B", "Bulk purchases / B2B"], ["API", "Ordering API"], ["BOTH", "B2B and API"]] as const;
export function businessText(form: FormData, key: string, label: string, max: number, min = 0) {
  const raw = form.get(key);
  if (raw !== null && typeof raw !== "string") throw Error(`Enter a valid ${label}.`);
  const value = String(raw ?? "").trim();
  if (value.length < min || value.length > max) throw Error(`Enter ${label} (${min}-${max} characters).`);
  return value;
}
export function parseBusinessInterest(form: FormData) {
  const details: Record<string, string> = {
    legal_name: businessText(form, "legal_name", "business name", 160, 2),
    contact_name: businessText(form, "contact_name", "contact name", 120, 2),
    country: businessText(form, "country", "country", 100, 2),
    interest: businessText(form, "interest", "business interest", 4, 2),
    website: businessText(form, "website", "website URL", 300),
    phone: businessText(form, "phone", "contact number", 40),
    activity: businessText(form, "activity", "business requirements", 2000, 10),
    monthly_volume: businessText(form, "monthly_volume", "estimated monthly purchases", 100, 1),
  };
  if (!countryCallingCodes.some(([name]) => name === details.country)) throw Error("Select a country.");
  if (!businessInterests.some(([value]) => value === details.interest)) throw Error("Select B2B, API, or both.");
  if (details.website) {
    let url: URL;
    try { url = new URL(details.website); } catch { throw Error("Enter a website URL starting with https:// or http://."); }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw Error("Enter a valid public website URL.");
  }
  if (form.get("consent") !== "accepted") throw Error("Confirm that we may contact you about your request.");
  return { ...details, consent: "business-interest-v1", onboarding_method: "EMAIL" };
}
