import {
  createHash,
  timingSafeEqual,
} from "node:crypto";

import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAllDeliveredCodes } from "@/lib/delivered-codes";

export const runtime = "nodejs";

type DeliveryRequest = {
  orderId?: unknown;
  accessToken?: unknown;
};

function hashesMatch(
  providedToken: string,
  storedHash: string,
) {
  const providedHash = createHash("sha256")
    .update(providedToken)
    .digest();

  const expectedHash = Buffer.from(
    storedHash,
    "hex",
  );

  return (
    expectedHash.length ===
      providedHash.length &&
    timingSafeEqual(
      providedHash,
      expectedHash,
    )
  );
}

export async function POST(
  request: NextRequest,
) {
  try {
    const body =
      (await request.json()) as DeliveryRequest;

    const orderId = String(
      body.orderId ?? "",
    ).trim();

    const accessToken = String(
      body.accessToken ?? "",
    ).trim();

    if (
      !orderId ||
      accessToken.length < 40
    ) {
      return NextResponse.json(
        {
          error:
            "Order access information is invalid.",
        },
        {
          status: 400,
        },
      );
    }

    const admin = createAdminClient();

    const orderResult = await admin
      .from("orders")
      .select(
        `
          id,
          order_number,
          status,
          customer_name,
          customer_email,
          total,
          currency,
          access_token_hash
        `,
      )
      .eq("id", orderId)
      .maybeSingle();

    const order = orderResult.data;

    if (
      orderResult.error ||
      !order ||
      !order.access_token_hash ||
      !hashesMatch(
        accessToken,
        order.access_token_hash,
      )
    ) {
      return NextResponse.json(
        {
          error: "Order access was denied.",
        },
        {
          status: 403,
        },
      );
    }

    /*
     * Codes are never returned before the
     * complete order becomes delivered.
     */
    if (order.status !== "DELIVERED") {
      return NextResponse.json({
        order: {
          orderNumber: order.order_number,
          status: order.status,
          total: order.total,
          currency: order.currency,
        },
        codes: [],
      });
    }

    const itemResult = await admin
      .from("order_items")
      .select(
        `
          id,
          product_id,
          product_name,
          product_option_id,
          option_name,
          denomination,
          platform,
          fulfillment_mode,
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

    const orderItems =
      itemResult.data ?? [];

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

    const productResult =
      productIds.length > 0
        ? await admin
            .from("products")
            .select("id, region")
            .in("id", productIds)
        : {
            data: [],
            error: null,
          };

    if (productResult.error) {
      throw productResult.error;
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

    const deliveredCodes = await getAllDeliveredCodes(itemIds);

    const codesByItem = new Map<
      string,
      string[]
    >();

    for (const row of deliveredCodes) {
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

    return NextResponse.json({
      order: {
        orderNumber: order.order_number,
        status: order.status,
        total: order.total,
        currency: order.currency,
      },

      codes: orderItems.map((item) => ({
        productName: item.product_name,
        optionName:
          item.option_name ?? null,
        denomination:
          item.denomination ?? null,
        platform: item.platform ?? null,
        fulfillmentMode:
          item.fulfillment_mode ?? null,
        region:
          regionByProduct.get(
            item.product_id,
          ) ?? null,
        codes:
          codesByItem.get(item.id) ?? [],
      })),
    });
  } catch {
    return NextResponse.json(
      {
        error: "Unable to load this order.",
      },
      {
        status: 500,
      },
    );
  }
}
