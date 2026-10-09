"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";

export default function ContactForm({ initialName = "", accountEmail = "" }: { initialName?: string; accountEmail?: string }) {
  const submitting = useRef(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [sentTo, setSentTo] = useState("");
  const feedback = useRef<HTMLDivElement>(null);
  const fieldClass = "mt-2 w-full rounded-xl border border-white/20 bg-slate-950 px-4 py-3 text-base text-white outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/30";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    submitting.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "contact", name: data.get("name"), email: data.get("email"), subject: data.get("subject"), orderNumber: data.get("orderNumber"), message: data.get("message"), website: data.get("website") }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to send your message. Please try again.");
      if (!result.message?.id || !result.conversation?.customer_email) throw new Error("We could not confirm your message. Please try again.");
      setSentTo(result.conversation.customer_email);
      form.reset();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to send your message. Please try again.");
    } finally {
      submitting.current = false;
      setPending(false);
      requestAnimationFrame(() => feedback.current?.focus());
    }
  }

  return (
    <section aria-labelledby="contact-form-heading" className="rounded-3xl border border-white/10 bg-slate-900 p-5 sm:p-8">
      <h2 id="contact-form-heading" className="text-2xl font-black">Send us a message</h2>
      <p className="mt-3 text-sm leading-6 text-slate-400">Need help with an order, payment or delivery? Our support team will reply by email during support hours.</p>
      {sentTo ? (
        <div ref={feedback} tabIndex={-1} role="status" className="mt-6 rounded-2xl border border-emerald-400/40 bg-emerald-500/10 p-5 outline-none">
          <h3 className="font-bold text-emerald-400">Message sent</h3>
          <p className="mt-2 break-words text-sm leading-6 text-slate-300">Your message is with our support team. Replies will go to {sentTo}.</p>
          <button type="button" className="mt-4 font-bold text-cyan-400 underline underline-offset-4" onClick={() => setSentTo("")}>Send another message</button>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-5" aria-busy={pending}>
          <fieldset disabled={pending} className="min-w-0 space-y-5 disabled:opacity-70">
            <div className="grid gap-5 sm:grid-cols-2">
              <label className="block text-sm font-semibold" htmlFor="contact-name">Name <span aria-hidden="true">*</span><input id="contact-name" name="name" autoComplete="name" required maxLength={100} defaultValue={initialName} className={fieldClass} /></label>
              <label className="block text-sm font-semibold" htmlFor="contact-email">Email <span aria-hidden="true">*</span><input id="contact-email" name="email" type="email" autoComplete="email" required maxLength={254} defaultValue={accountEmail} readOnly={!!accountEmail} aria-describedby={accountEmail ? "contact-account-email" : undefined} className={fieldClass} /></label>
            </div>
            {accountEmail && <p id="contact-account-email" className="text-xs text-slate-400">We will use the email address on your signed-in account.</p>}
            <label className="block text-sm font-semibold" htmlFor="contact-subject">Subject <span aria-hidden="true">*</span><input id="contact-subject" name="subject" required maxLength={120} className={fieldClass} /></label>
            <label className="block text-sm font-semibold" htmlFor="contact-order">Order number <span className="font-normal text-slate-400">(optional)</span><input id="contact-order" name="orderNumber" maxLength={80} className={fieldClass} /></label>
            <label className="block text-sm font-semibold" htmlFor="contact-message">Message <span aria-hidden="true">*</span><textarea id="contact-message" name="message" required maxLength={1500} rows={6} aria-describedby="contact-message-help" className={`${fieldClass} resize-y`} /></label>
            <p id="contact-message-help" className="text-xs leading-5 text-slate-400">Up to 1,500 characters. Please do not include passwords, security codes or payment card details.</p>
            <div hidden aria-hidden="true"><label htmlFor="contact-website">Website<input id="contact-website" name="website" tabIndex={-1} autoComplete="off" /></label></div>
          </fieldset>
          <p className="text-xs leading-5 text-slate-400">We use these details to respond to your enquiry. Read our <Link href="/privacy-policy" className="text-cyan-400 underline underline-offset-4">Privacy Policy</Link>.</p>
          {error && <div ref={feedback} tabIndex={-1} role="alert" className="rounded-xl border border-red-400/40 bg-red-500/10 p-4 text-sm text-red-300 outline-none">{error}</div>}
          <button type="submit" disabled={pending} className="w-full rounded-xl bg-cyan-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-cyan-300 disabled:cursor-wait disabled:opacity-60 sm:w-auto">{pending ? "Sending…" : "Send message"}</button>
        </form>
      )}
    </section>
  );
}
