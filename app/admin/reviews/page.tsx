import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../AdminSidebar";
import { hideReview, restoreReview } from "./actions";

export const dynamic = "force-dynamic";

type ReviewsPageProps = {
  searchParams: Promise<{ success?: string; error?: string }>;
};

export default async function AdminReviewsPage({
  searchParams,
}: ReviewsPageProps) {
  const { success, error } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const accessResult = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (accessResult.data?.role !== "super_admin") {
    redirect("/admin?error=Website administrator access is required");
  }

  const admin = createAdminClient();
  const reviewsResult = await admin
    .from("order_reviews")
    .select(
      "id, order_id, customer_email, sentiment, comment, is_visible, moderation_reason, created_at",
    )
    .order("created_at", { ascending: false });

  if (reviewsResult.error) {
    throw new Error(`Unable to load reviews: ${reviewsResult.error.message}`);
  }

  const reviews = reviewsResult.data ?? [];
  const orderIds = Array.from(new Set(reviews.map((review) => review.order_id)));
  const [ordersResult, itemsResult] = orderIds.length
    ? await Promise.all([
        admin
          .from("orders")
          .select("id, order_number")
          .in("id", orderIds),
        admin
          .from("order_items")
          .select("order_id, product_name")
          .in("order_id", orderIds),
      ])
    : [{ data: [], error: null }, { data: [], error: null }];

  if (ordersResult.error || itemsResult.error) {
    throw new Error("Unable to load review order details.");
  }

  const orderNumbers = new Map(
    (ordersResult.data ?? []).map((order) => [order.id, order.order_number]),
  );
  const productNames = new Map<string, string[]>();
  for (const item of itemsResult.data ?? []) {
    const names = productNames.get(item.order_id) ?? [];
    if (!names.includes(item.product_name)) names.push(item.product_name);
    productNames.set(item.order_id, names);
  }

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row">
        <AdminSidebar />
        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header>
            <p className="text-xs font-bold uppercase tracking-widest text-blue-600">
              Website administration
            </p>
            <h1 className="mt-2 text-3xl font-black">Verified Reviews</h1>
            <p className="mt-1 text-sm text-slate-500">
              Hide abusive feedback while preserving the verified purchase record.
            </p>
          </header>

          {success && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
              {success}
            </div>
          )}
          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              {error}
            </div>
          )}

          <div className="mt-7 space-y-4">
            {reviews.length === 0 ? (
              <div className="rounded-2xl border border-slate-200 p-8 text-center text-slate-500">
                No reviews have been submitted yet.
              </div>
            ) : (
              reviews.map((review) => (
                <article
                  key={review.id}
                  className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex flex-col justify-between gap-4 md:flex-row">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-black ${
                            review.sentiment === "POSITIVE"
                              ? "bg-emerald-100 text-emerald-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {review.sentiment}
                        </span>
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-black ${
                            review.is_visible
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-200 text-slate-600"
                          }`}
                        >
                          {review.is_visible ? "VISIBLE" : "HIDDEN"}
                        </span>
                      </div>
                      <h2 className="mt-3 font-black">
                        {(productNames.get(review.order_id) ?? ["Order review"]).join(
                          ", ",
                        )}
                      </h2>
                      <p className="mt-1 text-sm text-slate-500">
                        Order {orderNumbers.get(review.order_id) ?? review.order_id} · {review.customer_email}
                      </p>
                      {review.comment ? (
                        <p className="mt-4 whitespace-pre-line text-sm leading-6 text-slate-700">
                          {review.comment}
                        </p>
                      ) : (
                        <p className="mt-4 text-sm italic text-slate-400">
                          No written comment.
                        </p>
                      )}
                      {!review.is_visible && review.moderation_reason && (
                        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                          Hidden reason: {review.moderation_reason}
                        </p>
                      )}
                    </div>

                    <div className="w-full shrink-0 md:w-72">
                      {review.is_visible ? (
                        <form action={hideReview} className="grid gap-2">
                          <input type="hidden" name="review_id" value={review.id} />
                          <label className="text-xs font-bold text-slate-600">
                            Moderation reason
                          </label>
                          <input
                            name="reason"
                            required
                            minLength={3}
                            maxLength={500}
                            placeholder="Abusive or inappropriate content"
                            className="rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-red-400"
                          />
                          <button className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-black text-white hover:bg-red-500">
                            Hide review
                          </button>
                        </form>
                      ) : (
                        <form action={restoreReview}>
                          <input type="hidden" name="review_id" value={review.id} />
                          <button className="w-full rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-500">
                            Restore review
                          </button>
                        </form>
                      )}
                    </div>
                  </div>
                </article>
              ))
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
