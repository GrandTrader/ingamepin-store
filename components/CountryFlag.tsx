import { countryCode } from "@/lib/country-flag";

export default function CountryFlag({ region }: { region?: string | null }) {
  const code = countryCode(region);

  if (!code) return <span aria-hidden="true">🌐</span>;

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={`https://flagcdn.com/20x15/${code}.png`} alt="" width="20" height="15" className="inline-block rounded-[2px] object-cover" />;
}
