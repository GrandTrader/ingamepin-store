import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type LookupRequest = {
  orderNumber?: unknown;
  email?: unknown;
};

function lookupDenied() {
  return NextResponse.json(
    {
      error:
        "No order matched the supplied information.",
    },
    {
      status: 404,
      headers: {
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as LookupRequest;

    const orderNumber = String(
      body.orderNumber ?? "",
    )
      .trim()
      .toUpperCase();

    const email = String(
      body.email ?? "",
    )
      .trim()
      .toLowerCase();

    if (
      orderNumber.length < 8 ||
      orderNumber.length > 100 ||
      email.length < 5 ||
      email.length > 254 ||
      !email.includes("@")
    ) {
      return lookupDenied();
    }

    const admin = createAdminClient();

    const orderResult = await admin
      .from("orders")
      .select(
        `
          id,
          order_number,
          status,
          total,
          currency,
          created_at,
          paid_at,
          delivered_at
        `,
      )
      .eq("order_number", orderNumber)
      .ilike("customer_email", email)
      .maybeSingle();

    if (orderResult.error) {
      throw orderResult.error;
    }

    const order = orderResult.data;

    if (!order) {
      return lookupDenied();
    }

    if (order.status !== "DELIVERED") {
      return NextResponse.json(
        {
          order: {
            orderNumber: order.order_number,
            status: order.status,
            total: order.total,
            currency: order.currency,
            orderedAt: order.created_at,
            paidAt: order.paid_at,
            deliveredAt: order.delivered_at,
          },
          items: [],
        },
        {
          headers: {
            "Cache-Control": "no-store",
          },
        },
      );
    }

    const itemResult = await admin
      .from("order_items")
      .select(
        `
          id,
          product_id,
          product_name,
          option_name,
          denomination,
          platform,
          quantity
        `,
      )
      .eq("order_id", order.id)
      .order("created_at", {
        ascending: true,
      });

    if (itemResult.error) {
      throw itemResult.error;
    }

    const orderItems = itemResult.data ?? [];
    const itemIds = orderItems.map(
      (item) => item.id,
    );
    const productIds = Array.from(
      new Set(
        orderItems.map(
          (item) => item.product_id,
        ),
      ),
    );

    const [codeResult, productResult] =
      await Promise.all([
        itemIds.length > 0
          ? admin
              .from("gift_card_codes")
              .select("order_item_id, code")
              .in("order_item_id", itemIds)
              .eq("status", "SOLD")
              .order("sold_at", {
                ascending: true,
              })
          : Promise.resolve({
              data: [],
              error: null,
            }),

        productIds.length > 0
          ? admin
              .from("products")
              .select("id, region")
              .in("id", productIds)
          : Promise.resolve({
              data: [],
              error: null,
            }),
      ]);

    if (codeResult.error) {
      throw codeResult.error;
    }

    if (productResult.error) {
      throw productResult.error;
    }

    const codesByItem = new Map<
      string,
      string[]
    >();

    for (const row of codeResult.data ?? []) {
      if (!row.order_item_id) {
        continue;
      }

      const existing =
        codesByItem.get(row.order_item_id) ??
        [];

      existing.push(row.code);
      codesByItem.set(
        row.order_item_id,
        existing,
      );
    }

    const regionByProduct = new Map<
      string,
      string | null
    >();

    for (const product of
      productResult.data ?? []) {
      regionByProduct.set(
        product.id,
        product.region ?? null,
      );
    }

    return NextResponse.json(
      {
        order: {
          orderNumber: order.order_number,
          status: order.status,
          total: order.total,
          currency: order.currency,
          orderedAt: order.created_at,
          paidAt: order.paid_at,
          deliveredAt: order.delivered_at,
        },
        items: orderItems.map((item) => ({
          productName: item.product_name,
          optionName: item.option_name ?? null,
          denomination:
            item.denomination ?? null,
          platform: item.platform ?? null,
          region:
            regionByProduct.get(
              item.product_id,
            ) ?? null,
          quantity: item.quantity,
          codes:
            codesByItem.get(item.id) ?? [],
        })),
      },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "Unable to check this order right now.",
      },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  }
}
