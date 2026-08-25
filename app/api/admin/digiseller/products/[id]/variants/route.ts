import { NextResponse } from "next/server";

import { listDigiSellerVariants } from "@/lib/digiseller-api";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const access = await supabase.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (!access.data) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const productId = Number((await params).id);
  if (!Number.isSafeInteger(productId) || productId <= 0) return NextResponse.json({ error: "Invalid product." }, { status: 400 });
  try {
    return NextResponse.json({ variants: await listDigiSellerVariants(productId) });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load variants." }, { status: 502 });
  }
}
