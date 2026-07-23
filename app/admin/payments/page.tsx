import { redirect } from "next/navigation";

import AdminSidebar from "../AdminSidebar";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import {
  approvePayment,
  rejectPayment,
} from "./actions";

export const dynamic = "force-dynamic";

type PaymentPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

type PaymentRow = {
  id: string;
  order_id: string;
  method: string;
  amount: number;
  currency: string;
  transaction_id: string | null;
  screenshot_url: string | null;
  submitted_at: string | null;
};

type OrderRow = {
  id: string;
  order_number: string;
  customer_name: string | null;
  customer_email: string;
  customer_phone: string | null;
  total: number;
};

function money(
  amount: number,
  currency: string,
) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
  }).format(amount);
}

export default async function PaymentsPage({
  searchParams,
}: PaymentPageProps) {
  const { error, success } =
    await searchParams;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const adminResult = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminResult.data) {
    redirect("/admin/login?error=Access denied");
  }

  const admin = createAdminClient();

  const paymentResult = await admin
    .from("payments")
    .select(
      `
        id,
        order_id,
        method,
        amount,
        currency,
        transaction_id,
        screenshot_url,
        submitted_at
      `,
    )
    .eq("status", "SUBMITTED")
    .order("submitted_at", {
      ascending: true,
    });

  if (paymentResult.error) {
    throw new Error(
      `Unable to load payments: ${paymentResult.error.message}`,
    );
  }

  const payments =
    (paymentResult.data ?? []) as PaymentRow[];

  const orderIds = payments.map(
    (payment) => payment.order_id,
  );

  let orders: OrderRow[] = [];

  if (orderIds.length > 0) {
    const orderResult = await admin
      .from("orders")
      .select(
        `
          id,
          order_number,
          customer_name,
          customer_email,
          customer_phone,
          total
        `,
      )
      .in("id", orderIds);

    if (orderResult.error) {
      throw new Error(
        `Unable to load orders: ${orderResult.error.message}`,
      );
    }

    orders =
      (orderResult.data ?? []) as OrderRow[];
  }

  const orderById = new Map(
    orders.map((order) => [
      order.id,
      order,
    ]),
  );

  const reviews = await Promise.all(
    payments.map(async (payment) => {
      let proofUrl: string | null = null;

      if (payment.screenshot_url) {
        const signedResult =
          await admin.storage
            .from("payment-proofs")
            .createSignedUrl(
              payment.screenshot_url,
              300,
            );

        proofUrl =
          signedResult.data?.signedUrl ?? null;
      }

      return {
        payment,
        order: orderById.get(
          payment.order_id,
        ),
        proofUrl,
      };
    }),
  );

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col md:flex-row">
        <AdminSidebar
          orderCount={reviews.length}
        />

        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black">
                Payment review
              </h1>

              {reviews.length > 0 && (
                <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                  {reviews.length} waiting
                </span>
              )}
            </div>

            <p className="mt-2 max-w-3xl text-sm text-slate-500">
              Verify the transaction reference and
              screenshot before approval. Approved
              orders move to manual fulfillment.
            </p>
          </header>

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
              {success}
            </div>
          )}

          <div className="mt-8 grid gap-6">
            {reviews.map(
              ({
                payment,
                order,
                proofUrl,
              }) => (
                <article
                  key={payment.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
                >
                  <div className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_340px]">
                    <div>
                      <div className="flex flex-wrap items-center gap-3">
                        <h2 className="text-2xl font-black">
                          {order?.order_number ??
                            "Unknown order"}
                        </h2>

                        <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
                          REVIEW REQUIRED
                        </span>
                      </div>

                      <dl className="mt-6 grid gap-5 sm:grid-cols-2">
                        <Detail
                          label="Customer"
                          value={
                            order?.customer_name ??
                            "Not provided"
                          }
                        />

                        <Detail
                          label="Email"
                          value={
                            order?.customer_email ??
                            "Unknown"
                          }
                        />

                        <Detail
                          label="Phone"
                          value={
                            order?.customer_phone ??
                            "Not provided"
                          }
                        />

                        <Detail
                          label="Method"
                          value={payment.method}
                        />

                        <Detail
                          label="Amount"
                          value={money(
                            payment.amount,
                            payment.currency,
                          )}
                        />

                        <Detail
                          label="Transaction / UTR"
                          value={
                            payment.transaction_id ??
                            "Missing"
                          }
                          mono
                        />

                        <Detail
                          label="Submitted"
                          value={
                            payment.submitted_at
                              ? new Date(
                                  payment.submitted_at,
                                ).toLocaleString(
                                  "en-IN",
                                )
                              : "Unknown"
                          }
                        />
                      </dl>

                      <div className="mt-7 grid gap-5 border-t border-slate-200 pt-6">
                        <form
                          action={approvePayment}
                        >
                          <input
                            type="hidden"
                            name="payment_id"
                            value={payment.id}
                          />

                          <button
                            type="submit"
                            className="rounded-xl bg-emerald-600 px-5 py-3 font-black text-white transition hover:bg-emerald-500"
                          >
                            Verify Payment
                          </button>
                        </form>

                        <form
                          action={rejectPayment}
                          className="flex flex-col gap-3 sm:flex-row"
                        >
                          <input
                            type="hidden"
                            name="payment_id"
                            value={payment.id}
                          />

                          <input
                            name="reason"
                            required
                            minLength={3}
                            maxLength={500}
                            placeholder="Reason for rejection"
                            className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-red-400 focus:ring-2 focus:ring-red-100"
                          />

                          <button
                            type="submit"
                            className="rounded-xl border border-red-200 px-5 py-3 font-bold text-red-600 transition hover:bg-red-50"
                          >
                            Reject Payment
                          </button>
                        </form>
                      </div>
                    </div>

                    <div>
                      <p className="mb-2 text-sm font-bold text-slate-700">
                        Payment screenshot
                      </p>

                      {proofUrl ? (
                        <a
                          href={proofUrl}
                          target="_blank"
                          rel="noreferrer"
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={proofUrl}
                            alt={`Payment proof for ${
                              order?.order_number ??
                              "order"
                            }`}
                            className="max-h-96 w-full rounded-2xl border border-slate-200 bg-slate-50 object-contain"
                          />
                        </a>
                      ) : (
                        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
                          Screenshot is unavailable. Do
                          not approve this payment.
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ),
            )}

            {reviews.length === 0 && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-10 text-center">
                <p className="text-xl font-black text-slate-800">
                  No payments need review
                </p>

                <p className="mt-2 text-sm text-slate-500">
                  New submitted payment proofs will
                  appear here.
                </p>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Detail({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs font-bold uppercase tracking-wide text-slate-400">
        {label}
      </dt>

      <dd
        className={`mt-1 break-words text-slate-800 ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
