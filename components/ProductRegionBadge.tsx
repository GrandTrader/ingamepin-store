import CountryFlag from "./CountryFlag";
import { regionShortName } from "@/lib/country-flag";

export default function ProductRegionBadge({
  region,
  placement = "overlay",
}: {
  region?: string | null;
  placement?: "overlay" | "inline";
}) {
  const label = regionShortName(region);
  const inline = placement === "inline";
  return (
    <span
      title={region?.trim() || "Region not specified"}
      aria-label={`Product region: ${region?.trim() || "Not specified"}`}
      data-no-auto-translate
      className={inline
        ? "inline-flex max-w-full items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-900"
        : "absolute right-3 top-3 z-20 inline-flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-sm font-black text-slate-900 shadow-sm sm:right-4 sm:top-4 sm:text-base"}
    >
      <CountryFlag region={region} className={inline ? "h-4 w-6 shrink-0" : "h-5 w-7 shrink-0 sm:h-6 sm:w-8"} />
      <span className="truncate">{label}</span>
    </span>
  );
}
