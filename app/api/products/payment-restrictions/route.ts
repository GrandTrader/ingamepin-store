import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

const ALL_METHODS = ["WALLET", "BINANCE_PAY", "USDT_DIRECT", "PALLY", "FREEKASSA"] as const;
const ALL_NETWORKS = ["TRC20", "BEP20", "SOLANA"] as const;

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as { productIds?: unknown };
    const productIds = Array.isArray(body.productIds)
      ? [...new Set(body.productIds.map(String).map((id) => id.trim()).filter(Boolean))]
      : [];

    if (productIds.length === 0 || productIds.length > 100) {
      return NextResponse.json({ error: "The checkout products are invalid." }, { status: 400 });
    }

    const admin = createAdminClient();
    const result = await admin
      .from("products")
      .select("id, allowed_payment_methods, allowed_usdt_networks")
      .in("id", productIds);

    if (result.error || (result.data ?? []).length !== productIds.length) {
      return NextResponse.json(
        { error: "Unable to load payment methods for this cart." },
        { status: 400 },
      );
    }

    const products = result.data ?? [];
    const allowedPaymentMethods = ALL_METHODS.filter((method) =>
      products.every((product) =>
        (product.allowed_payment_methods ?? ALL_METHODS).includes(method),
      ),
    );
    const allowedUsdtNetworks = ALL_NETWORKS.filter((network) =>
      products.every((product) =>
        (product.allowed_usdt_networks ?? ALL_NETWORKS).includes(network),
      ),
    );

    return NextResponse.json(
      { allowedPaymentMethods, allowedUsdtNetworks },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Unable to load payment methods for this cart." },
      { status: 500 },
    );
  }
}
