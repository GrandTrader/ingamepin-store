import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type ExportStatus = "sold" | "unsold";

type GiftCodeExportRow = {
  id: string;
  code: string;
  denomination: number | null;
  status: string;
  note: string | null;
  created_at: string;
  sold_at: string | null;
};

function safeCsvValue(value: unknown) {
  const text = String(value ?? "");

  // Prevent spreadsheet formulas from executing.
  const protectedText = /^[=+\-@]/.test(text)
    ? `'${text}`
    : text;

  return `"${protectedText.replaceAll('"', '""')}"`;
}

function safeFileName(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      {
        error: "Authentication required.",
      },
      {
        status: 401,
      },
    );
  }

  const adminResult = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminResult.data) {
    return NextResponse.json(
      {
        error: "Administrator access required.",
      },
      {
        status: 403,
      },
    );
  }

  const productId =
    request.nextUrl.searchParams.get("product_id");

  const exportStatus =
    request.nextUrl.searchParams.get(
      "status",
    ) as ExportStatus | null;

  if (!productId) {
    return NextResponse.json(
      {
        error: "Please select a product.",
      },
      {
        status: 400,
      },
    );
  }

  if (
    exportStatus !== "sold" &&
    exportStatus !== "unsold"
  ) {
    return NextResponse.json(
      {
        error: "Invalid export status.",
      },
      {
        status: 400,
      },
    );
  }

  const productResult = await supabase
    .from("products")
    .select("id, name")
    .eq("id", productId)
    .maybeSingle();

  if (productResult.error || !productResult.data) {
    return NextResponse.json(
      {
        error: "Product not found.",
      },
      {
        status: 404,
      },
    );
  }

  const product = productResult.data;

  const databaseStatus =
    exportStatus === "sold"
      ? "SOLD"
      : "AVAILABLE";

  const codeResult = await supabase
    .from("gift_card_codes")
    .select(
      `
        id,
        code,
        denomination,
        status,
        note,
        created_at,
        sold_at
      `,
    )
    .eq("product_id", productId)
    .eq("status", databaseStatus)
    .order("created_at", {
      ascending: false,
    });

  if (codeResult.error) {
    return NextResponse.json(
      {
        error: codeResult.error.message,
      },
      {
        status: 500,
      },
    );
  }

  const codes =
    (codeResult.data ?? []) as GiftCodeExportRow[];

  const headings = [
    "Product",
    "Denomination",
    "Code",
    "Status",
    "Note",
    "Created At",
    "Sold At",
  ];

  const rows = codes.map((item) => [
    product.name,
    item.denomination ?? "",
    item.code,
    item.status,
    item.note ?? "",
    item.created_at,
    item.sold_at ?? "",
  ]);

  const csv = [
    headings.map(safeCsvValue).join(","),
    ...rows.map((row) =>
      row.map(safeCsvValue).join(","),
    ),
  ].join("\r\n");

  const date = new Date()
    .toISOString()
    .slice(0, 10);

  const productName =
    safeFileName(product.name) ||
    "product";

  const fileName =
    `${productName}-${exportStatus}-codes-${date}.csv`;

  return new NextResponse(
    `\uFEFF${csv}`,
    {
      status: 200,
      headers: {
        "Content-Type":
          "text/csv; charset=utf-8",
        "Content-Disposition":
          `attachment; filename="${fileName}"`,
        "Cache-Control":
          "private, no-store, max-age=0",
        "X-Content-Type-Options":
          "nosniff",
      },
    },
  );
}