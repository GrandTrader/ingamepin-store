import countries from "i18n-iso-countries";
import englishCountries from "i18n-iso-countries/langs/en.json";

countries.registerLocale(englishCountries);

export function countryFlag(region?: string | null) {
  if (!region || region.toLowerCase() === "global" || region.toLowerCase() === "worldwide") {
    return "🌐";
  }

  const code = countries.getAlpha2Code(region, "en");
  if (!code) return "🌐";

  return [...code.toUpperCase()]
    .map((letter) => String.fromCodePoint(127397 + letter.charCodeAt(0)))
    .join("");
}

export function countryCode(region?: string | null) {
  if (!region || region.toLowerCase() === "global" || region.toLowerCase() === "worldwide") return null;
  return countries.getAlpha2Code(region, "en")?.toLowerCase() ?? null;
}
