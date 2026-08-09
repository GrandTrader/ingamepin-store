import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

type InvoicePayload = {
  invoiceNumber?: unknown;
  invoiceDate?: unknown;
  customerName?: unknown;
  customerEmail?: unknown;
  customerCountry?: unknown;
  customerTaxpayerId?: unknown;
  customerAddress?: unknown;
  categoryName?: unknown;
  productName?: unknown;
  optionName?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  paymentStatus?: unknown;
  network?: unknown;
  transactionId?: unknown;
  notes?: unknown;
};

function clean(value: unknown, maximum = 500) {
  return String(value ?? "").trim().slice(0, maximum);
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Authentication is required." },
        { status: 401 },
      );
    }

    const access = await supabase
      .from("admin_users")
      .select("user_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!access.data) {
      return NextResponse.json(
        { error: "Administrator access is required." },
        { status: 403 },
      );
    }

    const body = (await request.json()) as InvoicePayload;
    const invoiceNumber = clean(body.invoiceNumber, 100);
    const invoiceDate = clean(body.invoiceDate, 10);
    const customerName = clean(body.customerName, 200);
    const customerEmail = clean(body.customerEmail, 320).toLowerCase();
    const productName = clean(body.productName, 300);
    const quantity = Number(body.quantity);
    const unitPrice = Number(body.unitPrice);
    const paymentStatus = clean(body.paymentStatus, 20);

    if (!invoiceNumber || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
      return NextResponse.json(
        { error: "Invoice number or date is invalid." },
        { status: 400 },
      );
    }

    if (!customerName || !customerEmail.includes("@") || !productName) {
      return NextResponse.json(
        { error: "Customer or product information is invalid." },
        { status: 400 },
      );
    }

    if (
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      !Number.isFinite(unitPrice) ||
      unitPrice <= 0
    ) {
      return NextResponse.json(
        { error: "Invoice quantity or price is invalid." },
        { status: 400 },
      );
    }

    if (paymentStatus !== "PAID" && paymentStatus !== "PENDING") {
      return NextResponse.json(
        { error: "Payment status is invalid." },
        { status: 400 },
      );
    }

    const invoiceData = {
      invoiceNumber,
      invoiceDate,
      customerName,
      customerEmail,
      customerCountry: clean(body.customerCountry, 150),
      customerTaxpayerId: clean(body.customerTaxpayerId, 100),
      customerAddress: clean(body.customerAddress, 1000),
      categoryName: clean(body.categoryName, 200),
      productName,
      optionName: clean(body.optionName, 300),
      quantity,
      unitPrice,
      paymentStatus,
      network: clean(body.network, 50),
      transactionId: clean(body.transactionId, 500),
      notes: clean(body.notes, 2000),
    };
    const result = await createAdminClient()
      .from("saved_invoices")
      .insert({
        invoice_number: invoiceNumber,
        source: "ADMIN",
        customer_name: customerName,
        customer_email: customerEmail,
        invoice_date: invoiceDate,
        payment_status: paymentStatus,
        currency: "USDT",
        total: Number((quantity * unitPrice).toFixed(2)),
        invoice_data: invoiceData,
        created_by: user.id,
      })
      .select("id")
      .single();

    if (result.error) {
      const message =
        result.error.code === "23505"
          ? "This invoice number already exists. Enter a unique invoice number."
          : `Unable to save invoice: ${result.error.message}`;
      return NextResponse.json({ error: message }, { status: 400 });
    }

    return NextResponse.json({ id: result.data.id });
  } catch {
    return NextResponse.json(
      { error: "Unable to save the invoice." },
      { status: 500 },
    );
  }
}
