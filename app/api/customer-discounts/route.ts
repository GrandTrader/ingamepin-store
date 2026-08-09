import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { countryCallingCodes } from "@/lib/countryCallingCodes";

export const dynamic = "force-dynamic";

function splitPhoneNumber(value: unknown) {
  const compactPhone = String(value ?? "").replace(/[^0-9+]/g, "");
  const callingCodes = Array.from(
    new Set(countryCallingCodes.map(([, callingCode]) => callingCode)),
  ).sort((first, second) => second.length - first.length);
  const countryCode = callingCodes.find((code) => compactPhone.startsWith(code));

  return {
    countryCode: countryCode ?? "+91",
    phone: countryCode
      ? compactPhone.slice(countryCode.length).replace(/\D/g, "")
      : compactPhone.replace(/\D/g, ""),
  };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ authenticated: false, email: null, discounts: {} });
    }

    const admin = createAdminClient();
    const [discountResult, profileResult] = await Promise.all([
      admin
        .from("customer_product_discounts")
        .select("product_id, discount_percent")
        .eq("user_id", user.id)
        .eq("is_active", true),
      admin
        .from("profiles")
        .select("name, phone")
        .eq("id", user.id)
        .maybeSingle(),
    ]);

    if (discountResult.error) {
      console.error("Customer discount lookup failed:", discountResult.error);
      return NextResponse.json({ error: "Unable to load customer discounts." }, { status: 500 });
    }

    if (profileResult.error) {
      console.error("Customer profile lookup failed:", profileResult.error);
    }

    const discounts = Object.fromEntries(
      (discountResult.data ?? []).map((row) => [
        row.product_id,
        Number(row.discount_percent),
      ]),
    );

    const fullName = String(
      profileResult.data?.name ?? user.user_metadata?.full_name ?? "",
    ).trim();
    const savedPhone =
      profileResult.data?.phone ?? user.user_metadata?.phone ?? "";
    const phoneDetails = splitPhoneNumber(savedPhone);

    return NextResponse.json({
      authenticated: true,
      fullName,
      email: user.email ?? null,
      countryCode: phoneDetails.countryCode,
      phone: phoneDetails.phone,
      discounts,
    });
  } catch (error) {
    console.error("Customer discount endpoint failed:", error);
    return NextResponse.json({ error: "Unable to load customer discounts." }, { status: 500 });
  }
}
