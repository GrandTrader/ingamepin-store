"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { sendOrderStatusEmails } from "@/lib/email";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function ordersRedirect(
  kind: "error" | "success",
  message: string,
): never {
  redirect(
    `/admin/orders?${kind}=${encodeURIComponent(message)}`,
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
    await supabase.auth.signOut();
    redirect("/admin/login?error=Access denied");
  }

  return user;
}

export async function completeManualOrder(
  formData: FormData,
) {
  const administrator =
    await requireAdministrator();
  const orderId = String(
    formData.get("order_id") ?? "",
  ).trim();

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      orderId,
    )
  ) {
    ordersRedirect("error", "Order ID is invalid.");
  }

  const admin = createAdminClient();
  const itemResult = await admin
    .from("order_items")
    .select(
      "id, product_name, option_name, fulfillment_mode, quantity, products!inner(delivery_type)",
    )
    .eq("order_id", orderId)
    .eq("products.delivery_type", "MANUAL")
    .order("created_at", {
      ascending: true,
    });

  if (itemResult.error) {
    ordersRedirect(
      "error",
      itemResult.error.message,
    );
  }

  if ((itemResult.data ?? []).length === 0) {
    ordersRedirect(
      "error",
      "This order has no products to deliver.",
    );
  }

  const deliveries = (
    itemResult.data ?? []
  ).map((item) => {
    if (
      item.fulfillment_mode ===
      "PLAYER_ID_TOPUP"
    ) {
      return {
        orderItemId: item.id,
        completed:
          formData.get(
            `completed_${item.id}`,
          ) === "on",
        codes: [],
      };
    }

    const codes = String(
      formData.get(`codes_${item.id}`) ??
        "",
    )
      .split(/\r?\n/)
      .map((code) => code.trim())
      .filter(Boolean);

    return {
      orderItemId: item.id,
      completed: false,
      codes,
    };
  });

  const completionResult = await admin.rpc(
    "complete_manual_order",
    {
      p_order_id: orderId,
      p_admin_user_id:
        administrator.id,
      p_deliveries: deliveries,
    },
  );

  if (completionResult.error) {
    ordersRedirect(
      "error",
      completionResult.error.message,
    );
  }

  const orderResult = await admin
    .from("orders")
    .select(
      "order_number, customer_name, customer_email, total, currency, status",
    )
    .eq("id", orderId)
    .single();

  if (orderResult.error) {
    console.error(
      "Completed order email lookup failed:",
      orderResult.error,
    );
  } else {
    const itemIds = (
      itemResult.data ?? []
    ).map((item) => item.id);
    const codeResult = await admin
      .from("gift_card_codes")
      .select("order_item_id, code")
      .in("order_item_id", itemIds)
      .eq("status", "SOLD")
      .order("sold_at", {
        ascending: true,
      });

    if (codeResult.error) {
      console.error(
        "Completed order code lookup failed:",
        codeResult.error,
      );
    }

    const deliveredItems = (
      itemResult.data ?? []
    )
      .map((item) => ({
        productName: item.product_name,
        optionName: item.option_name,
        codes: (codeResult.data ?? [])
          .filter(
            (code) =>
              code.order_item_id ===
              item.id,
          )
          .map((code) => code.code),
      }))
      .filter(
        (item) => item.codes.length > 0,
      );
    const order = orderResult.data;
    const deliveryResults =
      await sendOrderStatusEmails({
        event: "ORDER_DELIVERED",
        orderNumber:
          order.order_number,
        customerName:
          order.customer_name ??
          "Customer",
        customerEmail:
          order.customer_email,
        total: Number(order.total),
        currency: order.currency,
        orderStatus: order.status,
        deliveredItems,
      });

    deliveryResults.forEach(
      (deliveryResult, index) => {
        if (
          deliveryResult.status ===
          "rejected"
        ) {
          console.error(
            index === 0
              ? "Customer delivery email failed:"
              : "Admin delivery email failed:",
            deliveryResult.reason,
          );
        }
      },
    );
  }

  revalidatePath("/admin");
  revalidatePath("/admin/orders");
  revalidatePath("/admin/gift-codes");

  ordersRedirect(
    "success",
    "Products sent and order completed.",
  );
}
