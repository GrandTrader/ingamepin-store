import { countryCode } from "@/lib/country-flag";

export default function CountryFlag({ region }: { region?: string | null }) {
  const code = countryCode(region);

  if (!code) return <span aria-hidden="true">🌐</span>;

  return <span aria-hidden="true" className={`fi fi-${code} inline-block rounded-[2px]`} />;
}
