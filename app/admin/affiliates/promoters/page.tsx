import PromoterDirectory from "./PromoterDirectory";

export const dynamic = "force-dynamic";

export default function AffiliateApplicationsPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string; q?: string }> }) {
  return <PromoterDirectory view="applications" searchParams={searchParams} />;
}
