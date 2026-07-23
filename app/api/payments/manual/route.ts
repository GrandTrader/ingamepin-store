import { NextRequest, NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const MAXIMUM_FILE_SIZE = 5 * 1024 * 1024;

const allowedFileTypes: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export async function POST(request: NextRequest) {
  let uploadedPath = "";

  try {
    const formData = await request.formData();

    const orderId = String(
      formData.get("orderId") ?? ""
    ).trim();

    const orderNumber = String(
      formData.get("orderNumber") ?? ""
    ).trim();

    const customerEmail = String(
      formData.get("customerEmail") ?? ""
    ).trim();

    const transactionId = String(
      formData.get("transactionId") ?? ""
    )
      .trim()
      .toUpperCase();

    const screenshot = formData.get("screenshot");

    if (
      !orderId ||
      !orderNumber ||
      !customerEmail
    ) {
      return NextResponse.json(
        { error: "Order verification information is missing." },
        { status: 400 }
      );
    }

    if (!/^[A-Z0-9]{6,40}$/.test(transactionId)) {
      return NextResponse.json(
        { error: "Enter a valid transaction or UTR number." },
        { status: 400 }
      );
    }

    if (!(screenshot instanceof File)) {
      return NextResponse.json(
        { error: "Select a payment screenshot." },
        { status: 400 }
      );
    }

    const extension = allowedFileTypes[screenshot.type];

    if (!extension) {
      return NextResponse.json(
        { error: "Only JPG, PNG, and WEBP screenshots are allowed." },
        { status: 400 }
      );
    }

    if (
      screenshot.size <= 0 ||
      screenshot.size > MAXIMUM_FILE_SIZE
    ) {
      return NextResponse.json(
        { error: "Payment screenshot must be smaller than 5 MB." },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();
    const safeFileName = `${crypto.randomUUID()}.${extension}`;
    uploadedPath = `${orderId}/${safeFileName}`;

    const fileBytes = await screenshot.arrayBuffer();

    const uploadResult = await supabase.storage
      .from("payment-proofs")
      .upload(uploadedPath, fileBytes, {
        contentType: screenshot.type,
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadResult.error) {
      return NextResponse.json(
        { error: "Unable to upload the payment screenshot." },
        { status: 500 }
      );
    }

    const submissionResult = await supabase.rpc(
      "submit_manual_payment",
      {
        p_order_id: orderId,
        p_order_number: orderNumber,
        p_customer_email: customerEmail,
        p_transaction_id: transactionId,
        p_screenshot_path: uploadedPath,
      }
    );

    if (submissionResult.error) {
      await supabase.storage
        .from("payment-proofs")
        .remove([uploadedPath]);

      return NextResponse.json(
        {
          error:
            submissionResult.error.message ||
            "Unable to submit payment details.",
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      submission: submissionResult.data,
    });
  } catch {
    if (uploadedPath) {
      try {
        const supabase = createAdminClient();
        await supabase.storage
          .from("payment-proofs")
          .remove([uploadedPath]);
      } catch {
        // Cleanup failure is intentionally not exposed to the customer.
      }
    }

    return NextResponse.json(
      { error: "Unable to submit payment details." },
      { status: 500 }
    );
  }
}
