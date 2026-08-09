import { createHash, randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import {
  sendOrderCreatedEmails,
  sendOrderStatusEmails,
  sendWalletDebitEmails,
} from "@/lib/email";
import { prepareOrderForManualFulfillment } from "@/lib/manual-fulfillment";
import { notifyPaidOrderInTelegram } from "@/lib/telegram-order-notification";
import {
  calculateGatewayCommission,
  type GatewayCommissionSettings,
} from "@/lib/payment-gateway-commissions";
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

export async function GET(request: NextRequest) {
  const paymentMethod =
    request.nextUrl.searchParams.get("paymentMethod")?.trim() ?? "";
  const baseTotal = Number(request.nextUrl.searchParams.get("baseTotal"));

  if (
    !paymentMethod ||
    !Number.isFinite(baseTotal) ||
    baseTotal < 0 ||
    baseTotal > 1000000
  ) {
    return NextResponse.json(
      { error: "Payment fee request is invalid." },
      { status: 400 },
    );
  }

  const settings = await createAdminClient()
    .from("payment_gateway_settings")
    .select("gateway_commissions")
    .eq("id", true)
    .maybeSingle();

  if (settings.error) {
    return NextResponse.json(
      { error: "Unable to calculate the payment fee." },
      { status: 500 },
    );
  }

  const commission = calculateGatewayCommission(
    settings.data?.gateway_commissions as GatewayCommissionSettings | null,
    paymentMethod,
    baseTotal,
  );

  return NextResponse.json(
    { fee: commission.fee, total: commission.total },
    { headers: { "Cache-Control": "no-store" } },
  );
}

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
    const customerEmailForLimit = String(customer.email ?? "").trim().toLowerCase();
    const customerIp = (request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim() || null;
    const submittedItems = body.items as Array<{ productOptionId?: string; quantity?: number; customValue?: number }>;
    const optionIds = submittedItems.map((item) => String(item.productOptionId ?? "")).filter(Boolean);
    if (optionIds.length) {
      const optionsResult = await admin.from("product_options").select("id, product_id, denomination, selling_price, minimum_quantity, maximum_quantity").in("id", optionIds);
      const options = optionsResult.data ?? []; const productIds = [...new Set(options.map((option) => option.product_id))];
      const productsResult = productIds.length ? await admin.from("products").select("id, name, minimum_quantity, maximum_quantity, is_bulk_order").in("id", productIds) : { data: [] };
      for (const item of submittedItems) {
        const option = options.find((entry) => entry.id === item.productOptionId);
        const product = (productsResult.data ?? []).find((entry) => entry.id === option?.product_id);
        const quantity = Number(item.quantity ?? 1);
        const minimum = Number(option?.minimum_quantity ?? product?.minimum_quantity ?? 1);
        const maximum = Number(option?.maximum_quantity ?? product?.maximum_quantity ?? 10);
        if (product && (!Number.isSafeInteger(quantity) || quantity < minimum || quantity > maximum)) {
          return NextResponse.json({ error: `Allowed quantity for ${product.name}: ${minimum}-${maximum}.`, minimumQuantity: minimum, maximumQuantity: maximum }, { status: 400 });
        }
      }
      const restrictionsResult = productIds.length ? await admin.from("product_purchase_restrictions").select("product_id, weekly_limit, limit_currency, identity_mode, reset_mode, notification_message").in("product_id", productIds).eq("is_enabled", true) : { data: [] };
      for (const rule of restrictionsResult.data ?? []) {
        const currentValue = submittedItems.reduce((sum, item) => { const option = options.find((entry) => entry.id === item.productOptionId && entry.product_id === rule.product_id); if (!option) return sum; const quantity = Math.max(1, Number(item.quantity ?? 1)); return sum + (rule.limit_currency === "INR" ? Number(item.customValue ?? option.denomination ?? 0) : Number(option.selling_price ?? 0)) * quantity; }, 0);
        const since = new Date(); if (rule.reset_mode === "CALENDAR_WEEK") { const day = (since.getUTCDay() + 6) % 7; since.setUTCDate(since.getUTCDate() - day); since.setUTCHours(0, 0, 0, 0); } else since.setUTCDate(since.getUTCDate() - 7);
        const orderIds = new Set<string>();
        const identityQueries = [];
        if (rule.identity_mode !== "IP") identityQueries.push(admin.from("orders").select("id").eq("customer_email", customerEmailForLimit).gte("created_at", since.toISOString()).in("status", ["PAID", "PROCESSING", "DELIVERED"]));
        if (rule.identity_mode !== "IP" && signedInUser) identityQueries.push(admin.from("orders").select("id").eq("customer_id", signedInUser.id).gte("created_at", since.toISOString()).in("status", ["PAID", "PROCESSING", "DELIVERED"]));
        if (rule.identity_mode !== "ACCOUNT_EMAIL" && customerIp) identityQueries.push(admin.from("orders").select("id").eq("customer_ip", customerIp).gte("created_at", since.toISOString()).in("status", ["PAID", "PROCESSING", "DELIVERED"]));
        for (const query of await Promise.all(identityQueries)) for (const order of query.data ?? []) orderIds.add(order.id);
        let previousValue = 0;
        if (orderIds.size) { const previous = await admin.from("order_items").select("denomination, quantity, total_price").eq("product_id", rule.product_id).in("order_id", [...orderIds]); previousValue = (previous.data ?? []).reduce((sum, item) => sum + (rule.limit_currency === "INR" ? Number(item.denomination ?? 0) * Number(item.quantity ?? 1) : Number(item.total_price ?? 0)), 0); }
        const limit = Number(rule.weekly_limit); if (previousValue + currentValue > limit) return NextResponse.json({ error: rule.notification_message, weeklyLimit: limit, remaining: Math.max(0, limit - previousValue), currency: rule.limit_currency }, { status: 409 });
      }
    }
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
    if (customerIp) await admin.from("orders").update({ customer_ip: customerIp }).eq("id", orderResult.data.id);

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

    const commissionSettingsResult = await admin
      .from("payment_gateway_settings")
      .select("gateway_commissions")
      .eq("id", true)
      .maybeSingle();

    if (commissionSettingsResult.error) {
      return NextResponse.json(
        { error: "Unable to load payment gateway settings." },
        { status: 500 },
      );
    }

    const baseTotal = Number(orderResult.data.total ?? 0);
    const commission = calculateGatewayCommission(
      commissionSettingsResult.data
        ?.gateway_commissions as GatewayCommissionSettings | null,
      requestedPaymentMethod,
      baseTotal,
    );

    const [commissionOrderUpdate, commissionPaymentUpdate] =
      await Promise.all([
        admin
          .from("orders")
          .update({
            payment_fee: commission.fee,
            payment_fee_type: commission.type,
            payment_fee_value: commission.value,
            total: commission.total,
          })
          .eq("id", orderResult.data.id),
        admin
          .from("payments")
          .update({ amount: commission.total })
          .eq("order_id", orderResult.data.id),
      ]);

    if (commissionOrderUpdate.error || commissionPaymentUpdate.error) {
      return NextResponse.json(
        { error: "Unable to apply the payment gateway commission." },
        { status: 500 },
      );
    }

    Object.assign(orderResult.data, {
      payment_fee: commission.fee,
      paymentFee: commission.fee,
      total: commission.total,
      totalAmount: commission.total,
    });

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

    if (isWalletPayment && walletPaymentResult) {
      await notifyPaidOrderInTelegram(orderResult.data.id);
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
