import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

type OrderRequest = {
  customer?: {
    fullName?: string;
    email?: string;
    phone?: string;
    orderNote?: string;
  };
  paymentMethod?: string;
  items?: unknown[];
};

export async function POST(
  request: NextRequest
) {
  try {
    const contentLength = Number(
      request.headers.get("content-length") ?? 0
    );

    if (contentLength > 50_000) {
      return NextResponse.json(
        {
          error: "Order request is too large.",
        },
        {
          status: 413,
        }
      );
    }

    const body =
      (await request.json()) as OrderRequest;

    if (
      !body.customer ||
      !Array.isArray(body.items) ||
      body.items.length === 0
    ) {
      return NextResponse.json(
        {
          error: "The order information is incomplete.",
        },
        {
          status: 400,
        }
      );
    }

    const supabase = await createClient();

    const orderResult = await supabase.rpc(
      "create_store_order",
      {
        p_customer_name:
          body.customer.fullName ?? "",

        p_customer_email:
          body.customer.email ?? "",

        p_customer_phone:
          body.customer.phone ?? "",

        p_customer_note:
          body.customer.orderNote ?? null,

        p_payment_method:
          body.paymentMethod ?? "",

        p_items: body.items,
      }
    );

    if (orderResult.error) {
      return NextResponse.json(
        {
          error:
            orderResult.error.message ||
            "Unable to create the order.",
        },
        {
          status: 400,
        }
      );
    }

    return NextResponse.json({
      order: orderResult.data,
    });
  } catch {
    return NextResponse.json(
      {
        error:
          "Unable to process the order request.",
      },
      {
        status: 500,
      }
    );
  }
}