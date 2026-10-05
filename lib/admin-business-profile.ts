import { businessText, businessInterests } from "./business-interest";
import { countryCallingCodes } from "./countryCallingCodes";
import { parsePhoneNumberFromString } from "libphonenumber-js/max";

export const businessProfileSections = [
  { title: "Customer & representative", fields: [
    { key: "contact_name", label: "Customer / representative full name", max: 120, required: true },
    { key: "phone", label: "Phone with country code", max: 40, type: "tel" },
    { key: "representative_role", label: "Position / role", max: 100 },
    { key: "residence_country", label: "Country of residence", max: 100, type: "country" },
  ] },
  { title: "Company details", fields: [
    { key: "legal_name", label: "Registered business name", max: 160, required: true },
    { key: "entity_type", label: "Business / legal entity type", max: 100 },
    { key: "registration_number", label: "Company registration number", max: 100 },
    { key: "tax_number", label: "Tax / VAT number", max: 100 },
    { key: "incorporation_date", label: "Incorporation date", max: 10, type: "date" },
    { key: "registration_jurisdiction", label: "Registration jurisdiction", max: 120 },
    { key: "country", label: "Country of registration", max: 100, type: "country", required: true },
    { key: "website", label: "Business website", max: 300, type: "url" },
  ] },
  { title: "Registered business address", fields: [
    { key: "address_line1", label: "Address line 1", max: 150 },
    { key: "address_line2", label: "Address line 2", max: 150 },
    { key: "city", label: "City / town", max: 80 },
    { key: "state", label: "State / province / region", max: 80 },
    { key: "postal_code", label: "PIN / postal code", max: 16 },
  ] },
  { title: "Ownership & business requirements", fields: [
    { key: "owners", label: "Owners / controlling persons and ownership percentages", max: 2000, type: "textarea" },
    { key: "activity", label: "Business activity and purchase requirements", max: 2000, type: "textarea" },
    { key: "monthly_volume", label: "Estimated monthly purchases (include currency)", max: 100, required: true },
    { key: "interest", label: "Requested access", max: 4, type: "interest", required: true },
  ] },
] satisfies { title: string; fields: { key: string; label: string; max: number; required?: boolean; type?: string }[] }[];

export function parseAdminBusinessProfile(form: FormData, partial = false, savedCountry = "") {
  const details: Record<string, string> = {};
  for (const section of businessProfileSections) for (const field of section.fields) {
    const required = "required" in field && field.required;
    const value = businessText(form, field.key, field.label.toLowerCase(), field.max, required && !partial ? 2 : 0);
    if (value) details[field.key] = value;
  }
  for (const key of ["country", "residence_country"]) {
    if (details[key] && !countryCallingCodes.some(([name]) => name === details[key])) throw Error("Select a valid " + (key === "country" ? "country of registration." : "country of residence."));
  }
  if ((!partial || details.interest) && !businessInterests.some(([value]) => value === details.interest)) throw Error("Select B2B, API, or both.");
  if (details.incorporation_date) {
    const date = details.incorporation_date;
    const parsed = new Date(date + "T00:00:00Z");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date || date > new Date().toISOString().slice(0, 10)) throw Error("Enter a valid incorporation date that is not in the future.");
  }
  if (details.website) {
    let url: URL;
    try { url = new URL(details.website); } catch { throw Error("Enter a website URL starting with https:// or http://."); }
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) throw Error("Enter a valid business website URL.");
  }
  if (details.phone) {
    const phone = parsePhoneNumberFromString(details.phone);
    if (!details.phone.startsWith("+") || !phone?.isValid()) throw Error("Enter a valid phone number with its + country code.");
    details.phone = phone.number;
  }
  if (details.postal_code && !/^[a-zA-Z0-9][a-zA-Z0-9 -]{1,15}$/.test(details.postal_code)) throw Error("Enter a valid PIN / postal code.");
  if ((details.country || savedCountry) === "India" && details.postal_code && !/^[1-9][0-9]{5}$/.test(details.postal_code)) throw Error("Enter a valid six-digit Indian PIN code.");
  if (details.address_line1 || details.address_line2 || details.city || details.state || details.postal_code) {
    details.address = [details.address_line1, details.address_line2, details.city, details.state, details.postal_code, details.country].filter(Boolean).join("\n");
  }
  return details;
}

export const businessAddressKeys = ["address_line1", "address_line2", "city", "state", "postal_code"];
export function canCompleteBusinessField(details: Record<string, string>, key: string) {
  if (String(details[key] ?? "").trim()) return false;
  // Older accounts may only have a full address. Do not let a second address replace it.
  if (businessAddressKeys.includes(key) && String(details.address ?? "").trim() && !businessAddressKeys.some(k => String(details[k] ?? "").trim())) return false;
  return true;
}
export function parseBusinessProfileCompletion(form: FormData, saved: Record<string, string>) {
  for (const section of businessProfileSections) for (const field of section.fields) {
    if (String(form.get(field.key) ?? "").trim() && !canCompleteBusinessField(saved, field.key)) throw Error("Saved business details are locked. Refresh the page or contact support.");
  }
  const patch = parseAdminBusinessProfile(form, true, saved.country);
  delete patch.address; // The database rebuilds this from the locked row and new address fields.
  if (!Object.keys(patch).length) throw Error("Fill at least one empty field before saving.");
  return patch;
}
