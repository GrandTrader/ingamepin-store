import { isSupportedCountry, parsePhoneNumberFromString, type CountryCode } from "libphonenumber-js/max";
export function validateSellerPhone(raw: string, country: string): string | null {
  if (!isSupportedCountry(country) || !/^[0-9 ()-]{4,24}$/.test(raw)) return null;
  const phone = parsePhoneNumberFromString(raw, {defaultCountry: country as CountryCode, extract: false});
  if (!phone || phone.country !== country || !phone.isValid()) return null;
  const type = phone.getType();
  return type === "MOBILE" || type === "FIXED_LINE_OR_MOBILE" ? phone.number : null;
}
