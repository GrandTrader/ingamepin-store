import { countryCode } from "@/lib/country-flag";

export default function CountryFlag({
  region,
  className = "",
}: {
  region?: string | null;
  className?: string;
}) {
  const code = countryCode(region);

  if (!code) return <span aria-hidden="true" className={className}>🌐</span>;

  return <span aria-hidden="true" className={`fi fi-${code} inline-block rounded-[2px] ${className}`} />;
}
