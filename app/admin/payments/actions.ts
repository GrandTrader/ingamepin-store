"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { sendOrderStatusEmails } from "@/lib/email";
import { prepareOrderForManualFulfillment } from "@/lib/manual-fulfillment";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function paymentRedirect(
  kind: "error" | "success",
  message: string
): never {
  redirect(
    `/admin/payments?${kind}=${encodeURIComponent(message)}`
  );
}

async function requireAdministrator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const adminResult = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminResult.data) {
    redirect("/admin/login?error=Access denied");
  }
}

async function sendPaymentNotification(
  paymentId: string,
  event: "PAYMENT_APPROVED" | "PAYMENT_REJECTED",
  reason?: string,
) {
  const admin = createAdminClient();
  const paymentResult = await admin
    .from("payments")
    .select("order_id")
    .eq("id", paymentId)
    .single();

  if (paymentResult.error) {
    console.error("Payment notification lookup failed:", paymentResult.error);
    return;
  }

  const orderResult = await admin
    .from("orders")
    .select(
      "order_number, customer_name, customer_email, total, currency, status",
    )
    .eq("id", paymentResult.data.order_id)
    .single();

  if (orderResult.error) {
    console.error("Payment order notification lookup failed:", orderResult.error);
    return;
  }

  const order = orderResult.data;
  let deliveredItems: Array<{
    productName: string;
    optionName: string | null;
    codes: string[];
  }> = [];

  if (event === "PAYMENT_APPROVED" && order.status === "DELIVERED") {
    const itemResult = await admin
      .from("order_items")
      .select("id, product_name, option_name")
      .eq("order_id", paymentResult.data.order_id)
      .order("created_at", { ascending: true });

    if (itemResult.error) {
      console.error("Delivered item email lookup failed:", itemResult.error);
    } else {
      const itemIds = (itemResult.data ?? []).map((item) => item.id);
      const codeResult = itemIds.length
        ? await admin
            .from("gift_card_codes")
            .select("order_item_id, code")
            .in("order_item_id", itemIds)
            .eq("status", "SOLD")
            .order("sold_at", { ascending: true })
        : { data: [], error: null };

      if (codeResult.error) {
        console.error("Delivered code email lookup failed:", codeResult.error);
      } else {
        deliveredItems = (itemResult.data ?? [])
          .map((item) => ({
            productName: item.product_name,
            optionName: item.option_name,
            codes: (codeResult.data ?? [])
              .filter((code) => code.order_item_id === item.id)
              .map((code) => code.code),
          }))
          .filter((item) => item.codes.length > 0);
      }
    }
  }

  const deliveryResults = await sendOrderStatusEmails({
    event,
    orderNumber: order.order_number,
    customerName: order.customer_name ?? "Customer",
    customerEmail: order.customer_email,
    total: Number(order.total),
    currency: order.currency,
    orderStatus: order.status,
    reason,
    deliveredItems,
  });

  deliveryResults.forEach((deliveryResult, index) => {
    if (deliveryResult.status === "rejected") {
      console.error(
        index === 0
          ? "Customer payment email failed:"
          : "Admin payment email failed:",
        deliveryResult.reason,
      );
    }
  });
}

export async function approvePayment(formData: FormData) {
  await requireAdministrator();

  const paymentId = String(
    formData.get("payment_id") ?? ""
  ).trim();

  if (!paymentId) {
    paymentRedirect("error", "Payment ID is missing.");
  }

  const admin = createAdminClient();
  const result = await admin.rpc("approve_manual_payment", {
    p_payment_id: paymentId,
  });

  if (result.error) {
    paymentRedirect("error", result.error.message);
  }

  const paymentResult = await admin
    .from("payments")
    .select("order_id")
    .eq("id", paymentId)
    .single();

  if (paymentResult.error) {
    paymentRedirect(
      "error",
      paymentResult.error.message,
    );
  }

  try {
    await prepareOrderForManualFulfillment(
      paymentResult.data.order_id,
    );
  } catch (error) {
    paymentRedirect(
      "error",
      error instanceof Error
        ? error.message
        : "Unable to prepare the order for manual delivery.",
    );
  }

  await sendPaymentNotification(paymentId, "PAYMENT_APPROVED");

  revalidatePath("/admin");
  revalidatePath("/admin/payments");
  revalidatePath("/admin/gift-codes");
  paymentRedirect(
    "success",
    "Payment verified. The order is ready for manual fulfillment."
  );
}

export async function rejectPayment(formData: FormData) {
  await requireAdministrator();

  const paymentId = String(
    formData.get("payment_id") ?? ""
  ).trim();
  const reason = String(
    formData.get("reason") ?? ""
  ).trim();

  if (!paymentId) {
    paymentRedirect("error", "Payment ID is missing.");
  }

  if (reason.length < 3 || reason.length > 500) {
    paymentRedirect(
      "error",
      "Enter a rejection reason between 3 and 500 characters."
    );
  }

  const admin = createAdminClient();
  const result = await admin.rpc("reject_manual_payment", {
    p_payment_id: paymentId,
    p_reason: reason,
  });

  if (result.error) {
    paymentRedirect("error", result.error.message);
  }

  await sendPaymentNotification(
    paymentId,
    "PAYMENT_REJECTED",
    reason,
  );

  revalidatePath("/admin");
  revalidatePath("/admin/payments");
  paymentRedirect("success", "Payment rejected.");
}
