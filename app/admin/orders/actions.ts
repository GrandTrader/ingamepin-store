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

async function finalizeOrderWhenAllCodesSent(orderId: string) {
  const admin = createAdminClient();
  const items = await admin.from("order_items").select("id, quantity, fulfillment_mode").eq("order_id", orderId);
  if (items.error) return { completed: false, error: items.error.message };
  if (!(items.data ?? []).length) return { completed: false, error: null };
  for (const item of items.data ?? []) {
    if (item.fulfillment_mode === "PLAYER_ID_TOPUP") return { completed: false, error: null };
    const count = await admin.from("gift_card_codes").select("id", { count: "exact", head: true }).eq("order_item_id", item.id).eq("status", "SOLD");
    if (count.error) return { completed: false, error: count.error.message };
    if ((count.count ?? 0) < item.quantity) return { completed: false, error: null };
  }
  const update = await admin.from("orders").update({ status: "DELIVERED", delivered_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", orderId).in("status", ["PAID", "PROCESSING"]);
  return { completed: !update.error, error: update.error?.message ?? null };
}

export async function finalizeManualOrderFromCodes(formData: FormData) {
  await requireAdministrator();
  const orderId = String(formData.get("order_id") ?? "");
  const result = await finalizeOrderWhenAllCodesSent(orderId);
  if (result.error) ordersRedirect("error", result.error);
  if (!result.completed) ordersRedirect("error", "Some denominations are not completed yet.");
  revalidatePath("/admin/orders");
  ordersRedirect("success", "Order completed.");
}

export async function sendManualOrderItem(formData: FormData) {
  const administrator = await requireAdministrator();
  const orderId = String(formData.get("order_id") ?? ""); const itemId = String(formData.get("item_id") ?? "");
  const codes = String(formData.get("codes") ?? "").split(/\r?\n/).map((code) => code.trim()).filter(Boolean);
  if (!orderId || !itemId) ordersRedirect("error", "Order item is invalid.");
  if (new Set(codes).size !== codes.length) ordersRedirect("error", "Duplicate delivery codes are not allowed.");
  const admin = createAdminClient();
  const itemResult = await admin.from("order_items").select("id, order_id, product_id, product_option_id, product_name, option_name, denomination, quantity, fulfillment_mode, products!inner(delivery_type)").eq("id", itemId).eq("order_id", orderId).eq("products.delivery_type", "MANUAL").maybeSingle();
  const item = itemResult.data; if (!item || item.fulfillment_mode === "PLAYER_ID_TOPUP") ordersRedirect("error", "This denomination cannot be sent as codes.");
  if (codes.length !== item.quantity) ordersRedirect("error", `${item.product_name} requires exactly ${item.quantity} code(s).`);
  const existing = await admin.from("gift_card_codes").select("id, code, product_id, product_option_id, status").in("code", codes);
  if (existing.error) ordersRedirect("error", existing.error.message);
  for (const code of codes) {
    const row = (existing.data ?? []).find((entry) => entry.code === code);
    if (row && (row.status !== "AVAILABLE" || row.product_id !== item.product_id || (item.product_option_id && row.product_option_id !== item.product_option_id))) ordersRedirect("error", `Code ${code} is unavailable or belongs to another denomination.`);
  }
  for (const code of codes) {
    const row = (existing.data ?? []).find((entry) => entry.code === code);
    const result = row ? await admin.from("gift_card_codes").update({ status: "SOLD", order_item_id: item.id, reserved_at: new Date().toISOString(), sold_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", row.id) : await admin.from("gift_card_codes").insert({ product_id: item.product_id, product_option_id: item.product_option_id, order_item_id: item.id, denomination: item.denomination, code, status: "SOLD", reserved_at: new Date().toISOString(), sold_at: new Date().toISOString(), created_by: administrator.id });
    if (result.error) ordersRedirect("error", result.error.message);
  }
  const finalized = await finalizeOrderWhenAllCodesSent(orderId);
  if (finalized.error) ordersRedirect("error", finalized.error);
  const orderResult = await admin.from("orders").select("order_number, customer_name, customer_email, total, currency, status").eq("id", orderId).single();
  if (orderResult.data) await sendOrderStatusEmails({ event: "PRODUCT_SENT", orderNumber: orderResult.data.order_number, customerName: orderResult.data.customer_name ?? "Customer", customerEmail: orderResult.data.customer_email, total: Number(orderResult.data.total), currency: orderResult.data.currency, orderStatus: orderResult.data.status, deliveredItems: [{ productName: item.product_name, optionName: item.option_name, codes }] });
  revalidatePath("/admin/orders"); ordersRedirect("success", finalized.completed ? "All denominations sent. Order completed." : `${item.option_name ?? item.product_name} sent successfully.`);
}

export async function completeManualOrderItem(formData: FormData) {
  await requireAdministrator(); const orderId = String(formData.get("order_id") ?? ""); const itemId = String(formData.get("item_id") ?? ""); const admin = createAdminClient();
  const itemResult = await admin.from("order_items").select("id, quantity, option_name, product_name").eq("id", itemId).eq("order_id", orderId).maybeSingle(); if (!itemResult.data) ordersRedirect("error", "Order item was not found.");
  const sent = await admin.from("gift_card_codes").select("id", { count: "exact", head: true }).eq("order_item_id", itemId).eq("status", "SOLD"); if ((sent.count ?? 0) < itemResult.data.quantity) ordersRedirect("error", "Send all required codes before completing this denomination.");
  const items = await admin.from("order_items").select("id, quantity, fulfillment_mode").eq("order_id", orderId);
  if (items.error) ordersRedirect("error", items.error.message);
  let allComplete = (items.data ?? []).length > 0;
  for (const item of items.data ?? []) {
    if (item.fulfillment_mode === "PLAYER_ID_TOPUP") { allComplete = false; continue; }
    const count = await admin.from("gift_card_codes").select("id", { count: "exact", head: true }).eq("order_item_id", item.id).eq("status", "SOLD");
    if (count.error) ordersRedirect("error", count.error.message);
    if ((count.count ?? 0) < item.quantity) allComplete = false;
  }
  if (allComplete) {
    const completed = await admin.from("orders").update({ status: "DELIVERED", delivered_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", orderId).in("status", ["PAID", "PROCESSING"]);
    if (completed.error) ordersRedirect("error", completed.error.message);
  }
  revalidatePath("/admin/orders"); ordersRedirect("success", allComplete ? "All denominations completed. Order completed." : `${itemResult.data.option_name ?? itemResult.data.product_name} completed.`);
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
