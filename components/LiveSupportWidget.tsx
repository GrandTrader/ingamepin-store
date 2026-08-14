"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Message = {
  id: string;
  sender_type: "CUSTOMER" | "ADMIN";
  body: string;
  created_at: string;
};

type ChatData = {
  conversation: {
    id: string;
    customer_name: string;
    customer_email: string | null;
    status: "OPEN" | "CLOSED";
  } | null;
  messages: Message[];
};

export default function LiveSupportWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<ChatData>({
    conversation: null,
    messages: [],
  });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const loadChat = useCallback(async () => {
    try {
      const response = await fetch("/api/support/chat", { cache: "no-store" });
      const result = await response.json();
      if (response.ok) setData(result);
    } catch {
      // A temporary network interruption will be retried automatically.
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    loadChat();
    const timer = window.setInterval(loadChat, 4000);
    return () => window.clearInterval(timer);
  }, [open, loadChat]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data.messages, open]);

  async function sendMessage(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSending(true);

    try {
      const response = await fetch("/api/support/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, message }),
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? "Unable to send your message.");
        return;
      }

      setMessage("");
      await loadChat();
    } catch {
      setError("Unable to connect to support.");
    } finally {
      setSending(false);
    }
  }

  if (pathname.startsWith("/admin")) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[80] sm:bottom-6 sm:right-6">
      {open && (
        <section className="mb-3 flex h-[min(620px,calc(100vh-110px))] w-[calc(100vw-32px)] max-w-sm flex-col overflow-hidden rounded-2xl border border-cyan-400/30 bg-slate-950 shadow-2xl shadow-black/40">
          <header className="flex items-center justify-between bg-cyan-400 px-4 py-3 text-slate-950">
            <div>
              <p className="font-black">InGamePin Support</p>
              <p className="text-xs font-medium">We usually reply shortly</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg px-3 py-1 text-xl font-bold hover:bg-black/10"
              aria-label="Close live chat"
            >
              ×
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-900 p-4">
            {data.messages.length === 0 && (
              <div className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-sm text-slate-300">
                Hello! Tell us how we can help you.
              </div>
            )}

            {data.messages.map((entry) => (
              <div
                key={entry.id}
                className={`flex ${
                  entry.sender_type === "CUSTOMER"
                    ? "justify-end"
                    : "justify-start"
                }`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2 text-sm ${
                    entry.sender_type === "CUSTOMER"
                      ? "rounded-br-md bg-cyan-400 text-slate-950"
                      : "rounded-bl-md bg-slate-700 text-white"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{entry.body}</p>
                  <p className="mt-1 text-[10px] opacity-60">
                    {new Date(entry.created_at).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </p>
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>

          <form onSubmit={sendMessage} className="space-y-2 border-t border-slate-700 bg-slate-950 p-3">
            {!data.conversation && (
              <div className="grid grid-cols-2 gap-2">
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Your name"
                  maxLength={100}
                  className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                />
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="Your email"
                  type="email"
                  maxLength={320}
                  className="min-w-0 rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
                />
              </div>
            )}

            {error && <p className="text-xs font-medium text-red-400">{error}</p>}

            <div className="flex gap-2">
              <textarea
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Type your message..."
                rows={2}
                maxLength={2000}
                className="min-w-0 flex-1 resize-none rounded-xl border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-cyan-400"
              />
              <button
                type="submit"
                disabled={sending}
                className="rounded-xl bg-cyan-400 px-4 font-black text-slate-950 disabled:opacity-50"
              >
                {sending ? "..." : "Send"}
              </button>
            </div>
          </form>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="ml-auto flex h-12 items-center gap-2 rounded-full bg-cyan-400 px-4 text-sm font-black text-slate-950 shadow-xl shadow-black/30 transition hover:scale-105 sm:h-14 sm:px-5 sm:text-base"
        aria-label="Open live support chat"
      >
        <span className="text-xl" aria-hidden="true">●</span>
        Live Chat
      </button>
    </div>
  );
}
