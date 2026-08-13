"use client";

import { useState } from "react";

import LocalizedProductText from "./LocalizedProductText";

type ProductReview = {
  id: string;
  sentiment: "POSITIVE" | "NEGATIVE";
  comment: string | null;
  customerLabel: string;
  createdAt: string;
};

export default function ProductDetailsTabs({
  description,
  descriptionRu,
  deliveryInstructions,
  reviews,
  positiveCount,
  negativeCount,
}: {
  description: string;
  descriptionRu?: string | null;
  deliveryInstructions?: string | null;
  reviews: ProductReview[];
  positiveCount: number;
  negativeCount: number;
}) {
  const [activeTab, setActiveTab] = useState<"description" | "reviews">(
    "description",
  );
  const totalReviews = positiveCount + negativeCount;
  const positivePercentage = totalReviews
    ? Math.round((positiveCount / totalReviews) * 100)
    : 0;

  return (
    <section className="mt-5 sm:mt-7">
      <div className="flex items-center gap-1 border-b border-white/10">
        <button
          type="button"
          onClick={() => setActiveTab("description")}
          className={`border-b-2 px-4 py-3 text-sm font-black transition ${
            activeTab === "description"
              ? "border-cyan-400 text-cyan-300"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <LocalizedProductText english="Description" russian="Описание" />
        </button>
        <button
          type="button"
          onClick={() => setActiveTab("reviews")}
          className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-black transition ${
            activeTab === "reviews"
              ? "border-cyan-400 text-cyan-300"
              : "border-transparent text-slate-400 hover:text-white"
          }`}
        >
          <LocalizedProductText english="Reviews" russian="Отзывы" />
          <span className="rounded-full bg-white/10 px-2 py-0.5 text-xs text-slate-300">
            {totalReviews}
          </span>
        </button>
      </div>

      {activeTab === "description" ? (
        <div className="pt-5">
          <div className="whitespace-pre-line text-sm leading-6 text-slate-300 sm:text-base sm:leading-7">
            <LocalizedProductText
              english={description}
              russian={descriptionRu}
            />
          </div>

          {deliveryInstructions && (
            <div className="mt-5 rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 sm:p-5">
              <h2 className="font-black text-cyan-300">
                <LocalizedProductText
                  english="Delivery instructions"
                  russian="Инструкции по доставке"
                />
              </h2>
              <p className="mt-2 whitespace-pre-line text-sm leading-6 text-slate-300">
                {deliveryInstructions}
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="pt-5">
          {totalReviews > 0 ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 bg-slate-950 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500">
                    Verified reviews
                  </p>
                  <p className="mt-2 text-3xl font-black text-white">
                    {totalReviews}
                  </p>
                </div>
                <div className="rounded-2xl border border-emerald-400/20 bg-emerald-400/10 p-4">
                  <p className="text-xs uppercase tracking-wider text-emerald-300">
                    Positive
                  </p>
                  <p className="mt-2 text-3xl font-black text-emerald-300">
                    {positivePercentage}%
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-slate-950 p-4">
                  <p className="text-xs uppercase tracking-wider text-slate-500">
                    Positive / Negative
                  </p>
                  <p className="mt-2 text-lg font-black text-white">
                    {positiveCount} / {negativeCount}
                  </p>
                </div>
              </div>

              <div className="mt-5 space-y-3">
                {reviews.map((review) => (
                  <article
                    key={review.id}
                    className="rounded-2xl border border-white/10 bg-slate-950 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-black ${
                            review.sentiment === "POSITIVE"
                              ? "bg-emerald-400/15 text-emerald-300"
                              : "bg-red-400/15 text-red-300"
                          }`}
                        >
                          {review.sentiment === "POSITIVE"
                            ? "✓ Positive"
                            : "✕ Negative"}
                        </span>
                        <span className="text-xs font-bold text-cyan-300">
                          Verified purchase
                        </span>
                      </div>
                      <time className="text-xs text-slate-500">
                        {new Intl.DateTimeFormat("en-IN", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                        }).format(new Date(review.createdAt))}
                      </time>
                    </div>
                    {review.comment && (
                      <p className="mt-3 whitespace-pre-line text-sm leading-6 text-slate-300">
                        {review.comment}
                      </p>
                    )}
                    <p className="mt-3 text-xs text-slate-500">
                      {review.customerLabel}
                    </p>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950 p-8 text-center">
              <p className="font-black text-white">No verified reviews yet</p>
              <p className="mt-2 text-sm text-slate-400">
                Customers can review this product after a completed delivery.
              </p>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
