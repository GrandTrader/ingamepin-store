import { readPurchaseList } from "@/lib/purchase-list";
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
        "Cache-Control": "private, no-store",
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
          customer_name,
          customer_phone,
          customer_ip,
          customer_note,
          sales_channel,
          subtotal,
          discount,
          payment_fee,
          status,
          total,
          currency,
          created_at,
          paid_at,
          delivered_at,
          payment_expires_at,
          payment_expired_at
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

    const paymentResult = await admin.from("payments").select("method,status,amount,currency,transaction_id,gateway_order_id,gateway_payment_id,submitted_at,verified_at").eq("order_id", order.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (paymentResult.error) throw paymentResult.error;

    const itemResult = await admin
      .from("order_items")
      .select(
        `
          id,
          product_id,
          product_name,
          option_name,
          denomination,
          custom_value,
          product_options(denomination_currency),
          unit_price,
          total_price,
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
          customerName: order.customer_name,
          customerEmail: order.customer_email,
          customerPhone: order.customer_phone,
          checkoutIp: order.customer_ip,
          customerNote: order.customer_note,
          salesChannel: order.sales_channel,
          subtotal: order.subtotal,
          discount: order.discount,
          paymentFee: order.payment_fee,
          paymentAmount: paymentResult.data?.amount,
          paymentCurrency: paymentResult.data?.currency,
          transactionId: paymentResult.data?.transaction_id,
          gatewayOrderId: paymentResult.data?.gateway_order_id,
          gatewayPaymentId: paymentResult.data?.gateway_payment_id,
          submittedAt: paymentResult.data?.submitted_at,
          verifiedAt: paymentResult.data?.verified_at,
          status: order.status,
          total: order.total,
          currency: order.currency,
          orderedAt: order.created_at,
          expiresAt: order.payment_expires_at,
          expiredAt: order.payment_expired_at,
          paymentStatus: paymentResult.data?.status,
          paymentMethod: paymentResult.data?.method,
          paidAt: order.paid_at,
          deliveredAt: order.delivered_at,
        },
        items: orderItems.map((item) => ({
          productName: item.product_name,
          receiptUrl: deliveryReceipts.get(item.id) ?? null,
          optionName: item.option_name ?? null,
          denomination:
            item.denomination ?? null,
          customValue: item.custom_value,
          denominationCurrency: (Array.isArray(item.product_options) ? item.product_options[0] : item.product_options)?.denomination_currency ?? null,
          unitPrice: item.unit_price,
          totalPrice: item.total_price,
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
          "Cache-Control": "private, no-store",
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
          "Cache-Control": "private, no-store",
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
    return privateJson(await readPurchaseList(identity, page));
  } catch { return privateJson({ error: "Unable to load your purchases. Please try again." }, 503); }
}
