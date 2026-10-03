import PromoterDirectory from "../promoters/PromoterDirectory";

export const dynamic = "force-dynamic";

export default function ApprovedPromotersPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; q?: string }> }) {
  return <PromoterDirectory view="approved" searchParams={searchParams} />;
}
