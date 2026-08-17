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
  items?: unknown;
};

type InvoiceItemPayload = {
  categoryName?: unknown;
  productName?: unknown;
  optionName?: unknown;
  quantity?: unknown;
  unitPrice?: unknown;
  paymentMethod?: unknown;
  transactionId?: unknown;
};

function clean(value: unknown, maximum = 500) {
  return String(value ?? "").trim().slice(0, maximum);
}

async function requireAdministrator() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Authentication is required.", status: 401 } as const;
  }

  const access = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!access.data) {
    return { error: "Administrator access is required.", status: 403 } as const;
  }

  return { user } as const;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdministrator();
    if ("error" in auth) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status },
      );
    }

    const email = clean(
      request.nextUrl.searchParams.get("customerEmail"),
      320,
    ).toLowerCase();
    if (!email.includes("@")) {
      return NextResponse.json(
        { error: "Enter a valid customer email." },
        { status: 400 },
      );
    }

    const result = await createAdminClient()
      .from("saved_invoices")
      .select("invoice_data")
      .eq("customer_email", email)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (result.error) {
      return NextResponse.json(
        { error: "Unable to load customer details." },
        { status: 500 },
      );
    }

    if (!result.data) return NextResponse.json({ customer: null });

    const invoice = result.data.invoice_data as InvoicePayload;
    return NextResponse.json({
      customer: {
        name: clean(invoice.customerName, 200),
        email,
        country: clean(invoice.customerCountry, 150),
        taxpayerId: clean(invoice.customerTaxpayerId, 100),
        address: clean(invoice.customerAddress, 1000),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "Unable to load customer details." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAdministrator();
    if ("error" in auth) {
      return NextResponse.json(
        { error: auth.error },
        { status: auth.status },
      );
    }
    const { user } = auth;

    const body = (await request.json()) as InvoicePayload;
    const invoiceNumber = clean(body.invoiceNumber, 100);
    const invoiceDate = clean(body.invoiceDate, 10);
    const customerName = clean(body.customerName, 200);
    const customerEmail = clean(body.customerEmail, 320).toLowerCase();
    const paymentStatus = clean(body.paymentStatus, 20);
    const rawItems: InvoiceItemPayload[] = Array.isArray(body.items)
      ? (body.items as InvoiceItemPayload[])
      : [
          {
            categoryName: body.categoryName,
            productName: body.productName,
            optionName: body.optionName,
            quantity: body.quantity,
            unitPrice: body.unitPrice,
            paymentMethod: body.network
              ? `USDT ${clean(body.network, 50)}`
              : "Other",
            transactionId: body.transactionId,
          },
        ];
    const items = rawItems.map((item) => ({
      categoryName: clean(item.categoryName, 200),
      productName: clean(item.productName, 300),
      optionName: clean(item.optionName, 300),
      quantity: Number(item.quantity),
      unitPrice: Number(item.unitPrice),
      paymentMethod: clean(item.paymentMethod, 100),
      transactionId: clean(item.transactionId, 500),
    }));

    if (!invoiceNumber || !/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) {
      return NextResponse.json(
        { error: "Invoice number or date is invalid." },
        { status: 400 },
      );
    }

    if (!customerName || !customerEmail.includes("@")) {
      return NextResponse.json(
        { error: "Customer information is invalid." },
        { status: 400 },
      );
    }

    if (
      items.length < 1 ||
      items.length > 50 ||
      items.some(
        (item) =>
          !item.productName ||
          !item.paymentMethod ||
          !Number.isInteger(item.quantity) ||
          item.quantity < 1 ||
          !Number.isFinite(item.unitPrice) ||
          item.unitPrice <= 0,
      )
    ) {
      return NextResponse.json(
        { error: "One or more invoice products are invalid." },
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
      items,
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
        total: Number(
          items
            .reduce(
              (sum, item) => sum + item.quantity * item.unitPrice,
              0,
            )
            .toFixed(2),
        ),
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
