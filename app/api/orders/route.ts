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
    marketingConsent?: unknown;
  };
  paymentMethod?: unknown;
  items?: unknown;
};

const AFFILIATE_VISITOR_COOKIE = "igp_affiliate_visitor";
const AFFILIATE_CLICK_COOKIE = "igp_affiliate_click";

function affiliateVisitorHash(value: string, secret: string) {
  return createHash("sha256")
    .update(`${secret}:${value}`)
    .digest("hex");
}

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
    const paymentMethodId: Record<string, string> = {
      wallet: "WALLET",
      binance: "BINANCE_PAY",
      usdt: "USDT_DIRECT",
      pally: "PALLY",
      freekassa: "FREEKASSA",
      upi: "UPI",
    };

    if (!paymentMethodId[requestedPaymentMethod]) {
      return NextResponse.json({ error: "Payment method is invalid." }, { status: 400 });
    }

    if (requestedPaymentMethod === "upi") {
      const gatewayResult = await createAdminClient()
        .from("payment_gateway_settings")
        .select("gateway_commissions")
        .eq("id", true)
        .maybeSingle();
      const gatewaySettings = (gatewayResult.data?.gateway_commissions ?? {}) as Record<
        string,
        { enabled?: boolean }
      >;

      if (gatewayResult.error || gatewaySettings.UPI?.enabled !== true) {
        return NextResponse.json(
          { error: "Manual USDT BEP20 is currently unavailable." },
          { status: 400 },
        );
      }
    }

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

      if (signedInUser.app_metadata?.wallet_disabled === true) {
        return NextResponse.json(
          { error: "Your wallet is currently disabled. Contact support for assistance." },
          { status: 403 },
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
    const submittedCustomerName = String(customer.fullName ?? "").trim();
    const accountCustomerName = String(
      signedInUser?.user_metadata?.name ??
        signedInUser?.user_metadata?.full_name ??
        "",
    ).trim();
    const customerName = (
      submittedCustomerName ||
      accountCustomerName ||
      customerEmailForLimit.split("@")[0] ||
      "Customer"
    ).slice(0, 120);

    if (signedInUser && customer.marketingConsent === true) {
      const marketingMetadataResult = await admin.auth.admin.updateUserById(
        signedInUser.id,
        {
          user_metadata: {
            ...signedInUser.user_metadata,
            marketing_email_consent: true,
            marketing_email_consented_at: new Date().toISOString(),
          },
        },
      );

      if (marketingMetadataResult.error) {
        console.error(
          "Unable to save checkout marketing consent:",
          marketingMetadataResult.error.message,
        );
      }
    }

    if (customer.marketingConsent === true && customerEmailForLimit) {
      const consentResult = await admin
        .from("marketing_email_subscriptions")
        .upsert(
          {
            email: customerEmailForLimit,
            user_id: signedInUser?.id ?? null,
            subscribed: true,
            consent_source: "checkout",
            consented_at: new Date().toISOString(),
            unsubscribed_at: null,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "email" },
        );

      if (consentResult.error) {
        console.error(
          "Unable to save checkout marketing subscription:",
          consentResult.error.message,
        );
      }
    }
    const customerIp = (request.headers.get("cf-connecting-ip") ?? request.headers.get("x-forwarded-for")?.split(",")[0] ?? "").trim() || null;
    const submittedItems = body.items as Array<{ productOptionId?: string; quantity?: number; customValue?: number }>;
    const optionIds = submittedItems.map((item) => String(item.productOptionId ?? "")).filter(Boolean);
    if (optionIds.length) {
      const optionsResult = await admin.from("product_options").select("id, product_id, denomination, selling_price, minimum_quantity, maximum_quantity, is_active, is_in_stock").in("id", optionIds);
      const options = optionsResult.data ?? []; const productIds = [...new Set(options.map((option) => option.product_id))];
      const productsResult = productIds.length ? await admin.from("products").select("id, name, minimum_quantity, maximum_quantity, is_bulk_order, allowed_payment_methods").in("id", productIds) : { data: [] };
      const disallowedProduct = (productsResult.data ?? []).find(
        (product) =>
          !((product.allowed_payment_methods ?? ["WALLET", "BINANCE_PAY", "USDT_DIRECT", "PALLY", "FREEKASSA", "UPI"]) as string[])
            .includes(paymentMethodId[requestedPaymentMethod]),
      );
      if (disallowedProduct) {
        return NextResponse.json(
          { error: `${requestedPaymentMethod === "usdt" ? "Direct USDT" : requestedPaymentMethod} is not available for ${disallowedProduct.name}.` },
          { status: 400 },
        );
      }

      for (const item of submittedItems) {
        const option = options.find((entry) => entry.id === item.productOptionId);
        const product = (productsResult.data ?? []).find((entry) => entry.id === option?.product_id);
        if (!option || option.is_active !== true || option.is_in_stock === false) {
          return NextResponse.json({ error: "The selected product option is out of stock." }, { status: 409 });
        }
        const quantity = Number(item.quantity ?? 1);
        const minimum = Number(option?.minimum_quantity ?? product?.minimum_quantity ?? 1);
        const maximum = Number(option?.maximum_quantity ?? product?.maximum_quantity ?? 10);
        if (
          product &&
          (!Number.isSafeInteger(quantity) ||
            quantity < 1 ||
            (!product.is_bulk_order &&
              (quantity < minimum || quantity > maximum)))
        ) {
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
      p_customer_name: customerName.length >= 2 ? customerName : "Customer",
      p_customer_email: String(customer.email ?? ""),
      p_customer_phone: "",
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

    const affiliateClickId =
      request.cookies.get(AFFILIATE_CLICK_COOKIE)?.value?.trim() ?? "";
    const affiliateVisitorToken =
      request.cookies.get(AFFILIATE_VISITOR_COOKIE)?.value?.trim() ?? "";
    const affiliateHashSecret =
      process.env.AFFILIATE_HASH_SECRET ??
      process.env.SUPABASE_SECRET_KEY ??
      "";

    if (
      affiliateClickId &&
      affiliateVisitorToken &&
      affiliateHashSecret
    ) {
      const expectedVisitorHash = affiliateVisitorHash(
        affiliateVisitorToken,
        affiliateHashSecret,
      );
      const clickResult = await admin
        .from("affiliate_clicks")
        .select(
          "id, affiliate_id, product_id, visitor_token_hash, ip_hash, device_hash, landing_path, referrer_url, converted_order_id",
        )
        .eq("id", affiliateClickId)
        .eq("visitor_token_hash", expectedVisitorHash)
        .maybeSingle();

      if (clickResult.error) {
        console.error("Affiliate visit validation failed:", clickResult.error);
      } else if (clickResult.data) {
        let pricingClickId = clickResult.data.id;

        // An affiliate visit cookie can remain valid for several days, while a
        // click row represents only one conversion. Create a fresh conversion
        // row when the cookie points to a visit already used by another order.
        if (clickResult.data.converted_order_id) {
          const replacementClickResult = await admin
            .from("affiliate_clicks")
            .insert({
              affiliate_id: clickResult.data.affiliate_id,
              product_id: clickResult.data.product_id,
              visitor_token_hash: clickResult.data.visitor_token_hash,
              ip_hash: clickResult.data.ip_hash,
              device_hash: clickResult.data.device_hash,
              landing_path: clickResult.data.landing_path,
              referrer_url: clickResult.data.referrer_url,
            })
            .select("id")
            .single();

          if (replacementClickResult.error) {
            console.error(
              "Affiliate conversion visit refresh failed:",
              replacementClickResult.error,
            );
          } else {
            pricingClickId = replacementClickResult.data.id;
          }
        }

        const eligibleItemResult = await admin
          .from("order_items")
          .select("id", { count: "exact", head: true })
          .eq("order_id", orderResult.data.id)
          .eq("product_id", clickResult.data.product_id);

        if (eligibleItemResult.error) {
          console.error(
            "Affiliate order item validation failed:",
            eligibleItemResult.error,
          );
        } else if ((eligibleItemResult.count ?? 0) > 0) {
          const affiliatePricingResult = await admin.rpc(
            "apply_affiliate_order_pricing",
            {
              p_order_id: orderResult.data.id,
              p_affiliate_click_id: pricingClickId,
            },
          );

          if (affiliatePricingResult.error) {
            console.error(
              "Affiliate order pricing failed:",
              affiliatePricingResult.error,
            );

            const cleanupResult = await admin
              .from("orders")
              .delete()
              .eq("id", orderResult.data.id)
              .eq("status", "PENDING_PAYMENT");

            if (cleanupResult.error) {
              console.error(
                "Affiliate order cleanup failed:",
                cleanupResult.error,
              );
            }

            return NextResponse.json(
              {
                error:
                  "The affiliate price changed. Return to the product and try again.",
              },
              { status: 409 },
            );
          }

          const affiliatePricing = affiliatePricingResult.data as {
            markup?: number | string;
            subtotal?: number | string;
            total?: number | string;
          } | null;

          if (affiliatePricing) {
            Object.assign(orderResult.data, {
              affiliate_markup: Number(affiliatePricing.markup ?? 0),
              affiliateMarkup: Number(affiliatePricing.markup ?? 0),
              subtotal: Number(affiliatePricing.subtotal ?? 0),
              total: Number(affiliatePricing.total ?? 0),
              totalAmount: Number(affiliatePricing.total ?? 0),
            });
          }
        }
      }
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
            "id, order_number, customer_name, customer_email, customer_phone, total, currency, status",
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
        orderId: createdOrder.id,
        orderNumber: createdOrder.order_number,
        customerEmail: createdOrder.customer_email,
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
          orderId: createdOrder.id,
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
