import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  sendOrderCreatedEmails,
  sendOrderStatusEmails,
  sendWalletDebitEmails,
} from "@/lib/email";
import { prepareOrderForManualFulfillment } from "@/lib/manual-fulfillment";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type OrderRequest = {
  customer?: {
    fullName?: unknown;
    email?: unknown;
    phone?: unknown;
    orderNote?: unknown;
  };
  paymentMethod?: unknown;
  items?: unknown;
};

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as OrderRequest;
    const customer = body.customer ?? {};
    const requestedPaymentMethod = String(
      body.paymentMethod ?? "",
    )
      .trim()
      .toLowerCase();
    const isWalletPayment = requestedPaymentMethod === "wallet";

    const sessionClient = await createClient();
    const {
      data: { user: signedInUser },
    } = await sessionClient.auth.getUser();

    if (!Array.isArray(body.items)) {
      return NextResponse.json(
        { error: "Your cart is invalid." },
        { status: 400 }
      );
    }

    let walletUserId: string | null = null;

    if (isWalletPayment) {
      if (!signedInUser?.email) {
        return NextResponse.json(
          { error: "Sign in before paying with your wallet." },
          { status: 401 },
        );
      }

      if (
        signedInUser.email.toLowerCase() !==
        String(customer.email ?? "").trim().toLowerCase()
      ) {
        return NextResponse.json(
          {
            error:
              "Use the email address connected to your InGamePin account.",
          },
          { status: 400 },
        );
      }

      walletUserId = signedInUser.id;
    }

    const admin = createAdminClient();
    const orderResult = await admin.rpc("create_store_order", {
      p_customer_name: String(customer.fullName ?? ""),
      p_customer_email: String(customer.email ?? ""),
      p_customer_phone: String(customer.phone ?? ""),
      p_payment_method: isWalletPayment
        ? "wallet"
        : requestedPaymentMethod,
      p_items: body.items,
      p_customer_note: String(customer.orderNote ?? "") || null,
    });

    if (orderResult.error || !orderResult.data?.id) {
      return NextResponse.json(
        {
          error:
            orderResult.error?.message ??
            "Unable to create your order.",
        },
        { status: 400 }
      );
    }

    const customerEmail = String(customer.email ?? "").trim().toLowerCase();
    const discountEligibleUser =
      signedInUser?.email?.toLowerCase() === customerEmail
        ? signedInUser
        : null;

    if (discountEligibleUser) {
      const createdItemsResult = await admin
        .from("order_items")
        .select("product_id, total_price")
        .eq("order_id", orderResult.data.id);

      if (createdItemsResult.error) {
        return NextResponse.json({ error: "Unable to verify customer discounts." }, { status: 500 });
      }

      const productIds = Array.from(
        new Set((createdItemsResult.data ?? []).map((item) => item.product_id)),
      );
      const discountsResult = productIds.length
        ? await admin
            .from("customer_product_discounts")
            .select("product_id, discount_percent")
            .eq("user_id", discountEligibleUser.id)
            .eq("is_active", true)
            .in("product_id", productIds)
        : { data: [], error: null };

      if (discountsResult.error) {
        return NextResponse.json({ error: "Unable to verify customer discounts." }, { status: 500 });
      }

      const discountByProduct = new Map(
        (discountsResult.data ?? []).map((row) => [row.product_id, Number(row.discount_percent)]),
      );
      const discountAmount = (createdItemsResult.data ?? []).reduce(
        (total, item) =>
          total + Number(item.total_price) * Number(discountByProduct.get(item.product_id) ?? 0) / 100,
        0,
      );

      if (discountAmount > 0) {
        const totalsResult = await admin
          .from("orders")
          .select("subtotal")
          .eq("id", orderResult.data.id)
          .single();

        if (totalsResult.error) {
          return NextResponse.json({ error: "Unable to apply customer discounts." }, { status: 500 });
        }

        const subtotal = Number(totalsResult.data.subtotal);
        const total = Math.max(0, subtotal - discountAmount);
        const [orderUpdate, paymentUpdate] = await Promise.all([
          admin
            .from("orders")
            .update({ discount: discountAmount, total })
            .eq("id", orderResult.data.id),
          admin
            .from("payments")
            .update({ amount: total })
            .eq("order_id", orderResult.data.id),
        ]);

        if (orderUpdate.error || paymentUpdate.error) {
          return NextResponse.json({ error: "Unable to save customer discounts." }, { status: 500 });
        }

        Object.assign(orderResult.data, { subtotal, discount: discountAmount, total });
      }
    }

    let walletPaymentResult: Record<string, unknown> | null = null;

    if (isWalletPayment && walletUserId) {
      const customerLinkResult = await admin
        .from("orders")
        .update({ customer_id: walletUserId })
        .eq("id", orderResult.data.id)
        .is("customer_id", null)
        .select("id")
        .single();

      if (customerLinkResult.error) {
        console.error(
          "Wallet order customer link failed:",
          customerLinkResult.error,
        );

        return NextResponse.json(
          { error: "Unable to connect this order to your wallet." },
          { status: 500 },
        );
      }

      const walletResult = await admin.rpc(
        "pay_order_with_wallet",
        {
          p_order_id: orderResult.data.id,
          p_user_id: walletUserId,
        },
      );

      if (walletResult.error) {
        console.error("Wallet payment failed:", walletResult.error);

        return NextResponse.json(
          { error: walletResult.error.message },
          { status: 400 },
        );
      }

      walletPaymentResult =
        (walletResult.data as Record<string, unknown> | null) ?? null;

      const preparedOrder = await prepareOrderForManualFulfillment(
        orderResult.data.id,
      );

      walletPaymentResult = {
        ...walletPaymentResult,
        orderStatus: preparedOrder.status,
      };
    }

    const accessToken = randomBytes(32).toString("base64url");
    const accessTokenHash = createHash("sha256")
      .update(accessToken)
      .digest("hex");

    const tokenResult = await admin
      .from("orders")
      .update({ access_token_hash: accessTokenHash })
      .eq("id", orderResult.data.id)
      .is("access_token_hash", null)
      .select("id")
      .single();

    if (tokenResult.error) {
      return NextResponse.json(
        { error: "Unable to secure the new order." },
        { status: 500 }
      );
    }

    const [createdOrderResult, itemResult, paymentResult] =
      await Promise.all([
        admin
          .from("orders")
          .select(
            "order_number, customer_name, customer_email, customer_phone, total, currency, status",
          )
          .eq("id", orderResult.data.id)
          .single(),
        admin
          .from("order_items")
          .select(
            "id, product_name, option_name, denomination, platform, quantity",
          )
          .eq("order_id", orderResult.data.id)
          .order("created_at", { ascending: true }),
        admin
          .from("payments")
          .select("method")
          .eq("order_id", orderResult.data.id)
          .maybeSingle(),
      ]);

    if (createdOrderResult.error) {
      console.error(
        "Order email data query failed:",
        createdOrderResult.error,
      );
    } else if (itemResult.error) {
      console.error(
        "Order email item query failed:",
        itemResult.error,
      );
    } else {
      const createdOrder = createdOrderResult.data;
      const deliveryResults = await sendOrderCreatedEmails({
        orderNumber: createdOrder.order_number,
        customerName: createdOrder.customer_name ?? "Customer",
        customerEmail: createdOrder.customer_email,
        customerPhone: createdOrder.customer_phone,
        total: Number(createdOrder.total),
        currency: createdOrder.currency,
        paymentMethod:
          paymentResult.data?.method ??
          String(body.paymentMethod ?? ""),
        status: createdOrder.status,
        items: (itemResult.data ?? []).map((item) => ({
          productName: item.product_name,
          optionName: item.option_name,
          denomination:
            item.denomination === null
              ? null
              : Number(item.denomination),
          platform: item.platform,
          quantity: item.quantity,
        })),
      });

      deliveryResults.forEach((result, index) => {
        if (result.status === "rejected") {
          console.error(
            index === 0
              ? "Customer order email failed:"
              : "Admin order email failed:",
            result.reason,
          );
        }
      });

      if (isWalletPayment && walletPaymentResult) {
        const balanceAfter = Number(
          walletPaymentResult.walletBalanceAfter ?? 0,
        );

        const walletEmailResults = await sendWalletDebitEmails({
          orderNumber: createdOrder.order_number,
          customerName: createdOrder.customer_name ?? "Customer",
          customerEmail: createdOrder.customer_email,
          amount: Number(createdOrder.total),
          currency: createdOrder.currency,
          balanceAfter,
        });

        walletEmailResults.forEach((result, index) => {
          if (result.status === "rejected") {
            console.error(
              index === 0
                ? "Customer wallet debit email failed:"
                : "Admin wallet debit email failed:",
              result.reason,
            );
          }
        });

        const statusEmailResults = await sendOrderStatusEmails({
          event: "PAYMENT_APPROVED",
          orderNumber: createdOrder.order_number,
          customerName: createdOrder.customer_name ?? "Customer",
          customerEmail: createdOrder.customer_email,
          total: Number(createdOrder.total),
          currency: createdOrder.currency,
          orderStatus: createdOrder.status,
        });

        statusEmailResults.forEach((result, index) => {
          if (result.status === "rejected") {
            console.error(
              index === 0
                ? "Customer wallet delivery email failed:"
                : "Admin wallet delivery email failed:",
              result.reason,
            );
          }
        });
      }
    }

    return NextResponse.json({
      order: {
        ...orderResult.data,
        id: String(orderResult.data.id),
        orderNumber: String(
          orderResult.data.orderNumber ??
            orderResult.data.order_number ??
            "",
        ),
        subtotal: Number(orderResult.data.subtotal ?? 0),
        totalAmount: Number(
          orderResult.data.totalAmount ??
            orderResult.data.total ??
            0,
        ),
        paymentMethod: isWalletPayment
          ? "WALLET"
          : requestedPaymentMethod.toUpperCase(),
        status:
          String(walletPaymentResult?.orderStatus ?? "") ||
          String(orderResult.data.status ?? "PENDING_PAYMENT"),
        createdAt: String(
          orderResult.data.createdAt ??
            orderResult.data.created_at ??
            new Date().toISOString(),
        ),
        walletBalanceAfter:
          walletPaymentResult?.walletBalanceAfter ?? null,
        accessToken,
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to create your order." },
      { status: 500 }
    );
  }
}
