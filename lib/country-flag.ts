import countries from "i18n-iso-countries";
import englishCountries from "i18n-iso-countries/langs/en.json";

countries.registerLocale(englishCountries);

export function countryCode(region?: string | null) {
  const value = region?.trim();
  if (!value || /^(global|worldwide|world wide|international)$/i.test(value)) return null;
  if (/^(eu|europe|european union)$/i.test(value)) return "eu";
  const code = value.toUpperCase();
  if (/^[A-Z]{2}$/.test(code) && countries.isValid(code)) return code.toLowerCase();
  if (/^[A-Z]{3}$/.test(code)) {
    const alpha2 = countries.alpha3ToAlpha2(code);
    if (alpha2) return alpha2.toLowerCase();
  }
  return countries.getAlpha2Code(value, "en")?.toLowerCase() ?? null;
}

export function regionShortName(region?: string | null) {
  const value = region?.trim();
  if (!value) return "Not specified";
  if (/^(global|worldwide|world wide|international)$/i.test(value)) return "Global";
  const code = countryCode(value);
  if (code === "gb") return "UK";
  if (code === "us") return "USA";
  if (code === "ae") return "UAE";
  return code?.toUpperCase() ?? value;
}

export function countryFlag(region?: string | null) {
  const code = countryCode(region);
  if (!code) return "🌐";
  return [...code.toUpperCase()]
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
}
