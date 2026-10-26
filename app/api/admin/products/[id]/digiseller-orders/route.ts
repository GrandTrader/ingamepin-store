import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRequiredAdminAssurance } from "@/lib/admin-assurance";
import { isDigiSellerLogSource, readDigiSellerDeliveredContent, readDigiSellerOrderLog, validDigiSellerInvoice } from "@/lib/digiseller-order-log";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await createClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user || !(await hasRequiredAdminAssurance(session))) return NextResponse.json({ error: "Please sign in to Admin again." }, { status: 401, headers });
  const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) return NextResponse.json({ error: "Access denied." }, { status: 403, headers });
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const invoice = query.get("invoice") || undefined;
  const before = query.get("before") || undefined;
  const source = query.get("source");
  const delivered = query.get("delivered");
  if (!uuid.test(id) || (invoice && !validDigiSellerInvoice(invoice)) || (before && !validDigiSellerInvoice(before))
    || (source !== null && (!isDigiSellerLogSource(source) || !invoice)) || (delivered !== null && delivered !== "1")) {
    return NextResponse.json({ error: "Invalid DigiSeller history request." }, { status: 400, headers });
  }
  try {
    const admin = createAdminClient();
    if (source && isDigiSellerLogSource(source) && invoice) {
      const goods = await readDigiSellerDeliveredContent(admin, id, source, invoice);
      if (goods === null) return NextResponse.json({ error: "Delivered content was not found for this product and invoice." }, { status: 404, headers });
      return NextResponse.json({ goods }, { headers });
    }
    return NextResponse.json(await readDigiSellerOrderLog(admin, id, { invoice, before, deliveredOnly: delivered === "1" }), { headers });
  } catch {
    return NextResponse.json({ error: "Unable to load DigiSeller history. Please retry." }, { status: 500, headers });
  }
}
