import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasRequiredAdminAssurance } from "@/lib/admin-assurance";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await createClient();
  const { data: { user }, error } = await session.auth.getUser();
  if (error || !user || !(await hasRequiredAdminAssurance(session))) return NextResponse.json({ error: "Please sign in to Admin again." }, { status: 401, headers });
  const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) return NextResponse.json({ error: "Access denied." }, { status: 403, headers });
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const optionId = query.get("optionId") ?? "";
  const page = Number(query.get("page") ?? 1);
  if (!uuid.test(id) || !uuid.test(optionId) || !Number.isSafeInteger(page) || page < 1 || page > 100000) return NextResponse.json({ error: "Invalid stock request." }, { status: 400, headers });
  const admin = createAdminClient();
  const option = await admin.from("product_options").select("id").eq("id", optionId).eq("product_id", id).maybeSingle();
  if (option.error) return NextResponse.json({ error: "Unable to read stock. Please try again." }, { status: 500, headers });
  if (!option.data) return NextResponse.json({ error: "Denomination not found." }, { status: 404, headers });
  const result = await admin.from("gift_card_codes").select("id, code, status, created_at", { count: "exact" })
    .eq("product_id", id).eq("product_option_id", optionId)
    .order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 10, page * 10 - 1);
  if (result.error) return NextResponse.json({ error: "Unable to read codes. Please try again." }, { status: 500, headers });
  return NextResponse.json({ codes: result.data ?? [], total: result.count ?? 0 }, { headers });
}
