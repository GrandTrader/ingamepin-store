import { requireWupexAdmin } from "@/lib/wupex-admin";
import { requireWupexCredentials } from "@/lib/wupex-storage";
import { getCachedWupexCatalogFilters } from "@/lib/wupex-catalog-filters";
import { WupexError } from "@/lib/wupex-api";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  await requireWupexAdmin();
  try {
    const filters = await getCachedWupexCatalogFilters(await requireWupexCredentials());
    return Response.json({ data: filters }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    return Response.json({ error: error instanceof WupexError ? error.message : "Unable to load category and region filters. Please retry." }, { status: 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
