import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const optionId = request.nextUrl.searchParams.get("optionId");
  if (!optionId) return NextResponse.json({ error: "Select a denomination" }, { status: 400 });
  const supabase = await createClient(); const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const admin = createAdminClient();
  const [productResult, optionResult, codesResult] = await Promise.all([
    admin.from("products").select("slug").eq("id", id).maybeSingle(),
    admin.from("product_options").select("id, option_name").eq("id", optionId).eq("product_id", id).maybeSingle(),
    admin.from("gift_card_codes").select("code, denomination, status, note, created_at").eq("product_id", id).eq("product_option_id", optionId).eq("status", "AVAILABLE").order("created_at"),
  ]);
  if (!productResult.data || !optionResult.data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const option = optionResult.data;
  const escape = (value: unknown) => `"${String(value ?? "").replaceAll('"', '""')}"`;
  const rows = [["Voucher code", "Denomination", "Option", "Status", "Note", "Created at"], ...(codesResult.data ?? []).map((code) => [code.code, code.denomination ?? "", option.option_name, code.status, code.note ?? "", code.created_at])];
  const csv = rows.map((row) => row.map(escape).join(",")).join("\r\n");
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${productResult.data.slug}-${option.option_name}-unsold-codes.csv"` } });
}
