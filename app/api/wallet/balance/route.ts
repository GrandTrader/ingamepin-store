import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({
        authenticated: false,
        balance: 0,
        currency: "INR",
      });
    }

    const walletResult = await supabase
      .from("customer_wallets")
      .select("balance, currency")
      .eq("user_id", user.id)
      .maybeSingle();

    if (walletResult.error) {
      console.error(
        "Wallet balance query failed:",
        walletResult.error,
      );

      return NextResponse.json(
        { error: "Unable to load wallet balance." },
        { status: 500 },
      );
    }

    return NextResponse.json({
      authenticated: true,
      balance: Number(walletResult.data?.balance ?? 0),
      currency: walletResult.data?.currency ?? "INR",
    });
  } catch (error) {
    console.error("Wallet balance endpoint failed:", error);

    return NextResponse.json(
      { error: "Unable to load wallet balance." },
      { status: 500 },
    );
  }
}
