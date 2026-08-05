"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

type Conversation = {
  id: string;
  customer_name: string;
  customer_email: string | null;
  status: "OPEN" | "CLOSED";
  last_message_at: string;
  admin_last_read_at: string | null;
  created_at: string;
};

type Message = {
  id: string;
  sender_type: "CUSTOMER" | "ADMIN";
  body: string;
  created_at: string;
};

export default function LiveChatInbox() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [reply, setReply] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);
  const [mobileConversationOpen, setMobileConversationOpen] = useState(false);
  const messagesRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (requestedId?: string | null) => {
    try {
      const id = requestedId ?? selectedId;
      const query = id ? `?conversationId=${encodeURIComponent(id)}` : "";
      const response = await fetch(`/api/admin/support${query}`, {
        cache: "no-store",
      });
      const result = await response.json();

      if (!response.ok) {
        setError(result.error ?? "Unable to load live chat.");
        return;
      }

      setConversations(result.conversations);
      setSelectedId(result.selectedId);
      setMessages(result.messages);
      setError("");
    } catch {
      setError("Unable to connect to live chat.");
    }
  }, [selectedId]);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(), 4000);
    return () => window.clearInterval(timer);
  }, [load]);

  useEffect(() => {
    const container = messagesRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!selectedId || !reply.trim()) return;
    setSending(true);

    const response = await fetch("/api/admin/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversationId: selectedId,
        message: reply,
      }),
    });
    const result = await response.json();
    setSending(false);

    if (!response.ok) {
      setError(result.error ?? "Unable to send reply.");
      return;
    }

    setReply("");
    await load(selectedId);
  }

  async function changeStatus(action: "open" | "close") {
    if (!selectedId) return;
    await fetch("/api/admin/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ conversationId: selectedId, action }),
    });
    await load(selectedId);
  }

  const selected = conversations.find((entry) => entry.id === selectedId);

  return (
    <div>
      <div className="mb-6">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-cyan-600">
          Customer support
        </p>
        <h1 className="mt-1 text-3xl font-black">Live Chat</h1>
        <p className="mt-1 text-sm text-slate-500">
          Reply to customers from desktop or mobile.
        </p>
      </div>

      {error && (
        <p className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="grid h-[calc(100dvh-220px)] min-h-[360px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:grid-cols-[340px_1fr]">
        <aside
          className={`min-h-0 overflow-hidden border-b border-slate-200 lg:flex lg:h-full lg:flex-col lg:border-b-0 lg:border-r ${
            mobileConversationOpen ? "hidden" : "block"
          }`}
        >
          <div className="border-b border-slate-200 p-4 font-black">
            Conversations ({conversations.length})
          </div>
          <div className="min-h-0 overflow-y-auto lg:flex-1">
            {conversations.map((entry) => {
              const unread =
                !entry.admin_last_read_at ||
                new Date(entry.last_message_at) >
                  new Date(entry.admin_last_read_at);

              return (
                <button
                  key={entry.id}
                  type="button"
                  onClick={() => {
                    setSelectedId(entry.id);
                    setMobileConversationOpen(true);
                    load(entry.id);
                  }}
                  className={`block w-full border-b border-slate-100 p-4 text-left ${
                    selectedId === entry.id
                      ? "bg-cyan-50"
                      : "hover:bg-slate-50"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate font-bold">{entry.customer_name}</p>
                    {unread && <span className="h-2.5 w-2.5 rounded-full bg-cyan-500" />}
                  </div>
                  <p className="truncate text-xs text-slate-500">
                    {entry.customer_email || "Guest visitor"}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[11px]">
                    <span className={entry.status === "OPEN" ? "text-emerald-600" : "text-slate-400"}>
                      {entry.status}
                    </span>
                    <span className="text-slate-400">
                      {new Date(entry.last_message_at).toLocaleString()}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </aside>

        <section
          className={`h-full min-h-0 flex-col overflow-hidden bg-white lg:static lg:z-auto lg:flex ${
            mobileConversationOpen ? "fixed inset-0 z-[110] flex" : "hidden"
          }`}
        >
          {selected ? (
            <>
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
                <div className="flex min-w-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setMobileConversationOpen(false)}
                    className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-black lg:hidden"
                  >
                    Back
                  </button>
                  <div className="min-w-0">
                    <p className="truncate font-black">{selected.customer_name}</p>
                    <p className="truncate text-xs text-slate-500">
                      {selected.customer_email || "Guest visitor"}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    changeStatus(selected.status === "OPEN" ? "close" : "open")
                  }
                  className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold"
                >
                  {selected.status === "OPEN" ? "Close conversation" : "Reopen conversation"}
                </button>
              </header>

              <div ref={messagesRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain bg-slate-50 p-4">
                {messages.map((entry) => (
                  <div
                    key={entry.id}
                    className={`flex ${
                      entry.sender_type === "ADMIN" ? "justify-end" : "justify-start"
                    }`}
                  >
                    <div
                      className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                        entry.sender_type === "ADMIN"
                          ? "rounded-br-md bg-blue-600 text-white"
                          : "rounded-bl-md border border-slate-200 bg-white"
                      }`}
                    >
                      <p className="whitespace-pre-wrap break-words">{entry.body}</p>
                      <p className="mt-1 text-[10px] opacity-60">
                        {new Date(entry.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <form onSubmit={submit} className="flex shrink-0 gap-2 border-t border-slate-200 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:p-4">
                <textarea
                  value={reply}
                  onChange={(event) => setReply(event.target.value)}
                  rows={2}
                  maxLength={2000}
                  placeholder="Type your reply..."
                  className="min-w-0 flex-1 resize-none rounded-xl border border-slate-300 px-3 py-2 outline-none focus:border-blue-500"
                />
                <button
                  type="submit"
                  disabled={sending}
                  className="rounded-xl bg-blue-600 px-5 font-black text-white disabled:opacity-50"
                >
                  {sending ? "Sending..." : "Send"}
                </button>
              </form>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-8 text-center text-slate-500">
              No customer conversations yet.
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
