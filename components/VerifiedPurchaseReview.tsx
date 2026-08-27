"use client";

import { FormEvent, useState } from "react";

type Props = { orderId?: string; orderNumber?: string; email?: string; accessToken?: string };

export default function VerifiedPurchaseReview(props: Props) {
  const [sentiment, setSentiment] = useState<"POSITIVE" | "NEGATIVE" | "">("");
  const [message, setMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submitReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!sentiment || loading) return;
    setLoading(true);
    setMessage("");
    const form = new FormData(event.currentTarget);
    const response = await fetch("/api/orders/review", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...props, sentiment, comment: form.get("comment") }),
    });
    const result = (await response.json()) as {
      error?: string;
      rewardAmount?: number;
      supportCaseCreated?: boolean;
    };
    setLoading(false);
    if (!response.ok) return setMessage(result.error ?? "Unable to submit your review.");
    if (sentiment === "POSITIVE" && Number(result.rewardAmount ?? 0) > 0) {
      setSuccessMessage(
        `Thank you. $${Number(result.rewardAmount).toFixed(2)} has been added to your wallet.`,
      );
    } else if (sentiment === "NEGATIVE" && result.supportCaseCreated) {
      setSuccessMessage(
        "Thank you. A support case has been opened so our team can resolve the issue.",
      );
    } else {
      setSuccessMessage("Thank you. Your review was submitted successfully.");
    }
    setSubmitted(true);
  }

  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <p className="text-xs font-black uppercase tracking-[0.2em] text-cyan-600">Verified purchase</p>
      <h2 className="mt-2 text-xl font-black text-slate-900">How was your purchase?</h2>
      {submitted ? (
        <p className="mt-4 rounded-xl bg-emerald-50 p-4 font-bold text-emerald-700">{successMessage}</p>
      ) : (
        <form onSubmit={submitReview} className="mt-4">
          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={() => setSentiment("POSITIVE")} className={`rounded-xl border px-5 py-3 font-black transition ${sentiment === "POSITIVE" ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-200 text-slate-700 hover:border-emerald-400"}`}>👍 Positive</button>
            <button type="button" onClick={() => setSentiment("NEGATIVE")} className={`rounded-xl border px-5 py-3 font-black transition ${sentiment === "NEGATIVE" ? "border-red-500 bg-red-500 text-white" : "border-slate-200 text-slate-700 hover:border-red-400"}`}>👎 Negative</button>
          </div>
          <textarea name="comment" maxLength={1000} rows={3} placeholder="Optional comment about your purchase" className="mt-4 w-full rounded-xl border border-slate-200 px-4 py-3 outline-none focus:border-cyan-500" />
          {message && <p className="mt-3 text-sm font-bold text-red-600">{message}</p>}
          <button type="submit" disabled={!sentiment || loading} className="review-submit-button mt-4 rounded-xl border px-5 py-3 font-black shadow-sm transition">{loading ? "Submitting..." : "Submit review"}</button>
        </form>
      )}
    </section>
  );
}
