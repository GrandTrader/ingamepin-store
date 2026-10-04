import { getAuthorizedDeliveryReceipts } from "@/lib/delivery-receipts";
import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAllDeliveredCodes } from "@/lib/delivered-codes";
import { ownsPurchase, purchaseIdentity } from "@/lib/purchase-access";
import { privateJson, requestLimit } from "@/lib/request-security";

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
    const identity = await purchaseIdentity();
    if (!identity) return privateJson({ error: "Verify your email to view your purchases.", verificationRequired: true }, 401);
    const blocked = await requestLimit(request, "purchase-read", 120, 60);
    if (blocked) return blocked;
    const body =
      (await request.json()) as LookupRequest;

    const orderNumber = String(
      body.orderNumber ?? "",
    )
      .trim()
      .toUpperCase();

    if (
      orderNumber.length < 8 ||
      orderNumber.length > 100
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
          customer_email,
          customer_id,
          status,
          total,
          currency,
          created_at,
          paid_at,
          delivered_at
        `,
      )
      .eq("order_number", orderNumber)
      .maybeSingle();

    if (orderResult.error) {
      throw orderResult.error;
    }

    const order = orderResult.data;

    if (!order || !ownsPurchase(identity, order)) {
      return lookupDenied();
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
          fulfillment_mode,
          service_delivered_at,
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
    const deliveryReceipts = await getAuthorizedDeliveryReceipts(admin, order.id, order.status);

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

    const [deliveredCodes, productResult] =
      await Promise.all([
        getAllDeliveredCodes(itemIds),

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

    if (productResult.error) {
      throw productResult.error;
    }

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
          receiptUrl: deliveryReceipts.get(item.id) ?? null,
          optionName: item.option_name ?? null,
          denomination:
            item.denomination ?? null,
          platform: item.platform ?? null,
          region:
            regionByProduct.get(
              item.product_id,
            ) ?? null,
          quantity: item.quantity,
          serviceCompleted: Boolean(item.service_delivered_at) || (item.fulfillment_mode === "PLAYER_ID_TOPUP" && order.status === "DELIVERED"),
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

export async function GET(request: NextRequest) {
  try {
    const identity = await purchaseIdentity();
    if (!identity) return privateJson({ error: "Verify your email to view your purchases.", verificationRequired: true }, 401);
    const blocked = await requestLimit(request, "purchase-read", 120, 60);
    if (blocked) return blocked;
    const page = Number(request.nextUrl.searchParams.get("page") ?? 1);
    if (!Number.isSafeInteger(page) || page < 1 || page > 10000) return privateJson({ error: "Invalid page." }, 400);
    let query = createAdminClient().from("orders").select("order_number,status,total,currency,created_at");
    query = identity.userId
      ? query.or(`customer_id.eq.${identity.userId},customer_email.eq.${JSON.stringify(identity.email)}`)
      : query.eq("customer_email", identity.email);
    const result = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).range((page - 1) * 20, page * 20);
    if (result.error) throw Error("Unable to load purchases.");
    return privateJson({ orders: (result.data ?? []).slice(0, 20), page, hasMore: (result.data?.length ?? 0) > 20, email: identity.email, source: identity.source });
  } catch { return privateJson({ error: "Unable to load your purchases. Please try again." }, 503); }
}
