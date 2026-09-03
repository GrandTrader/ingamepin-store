"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

const supportOptions = [
  {
    name: "WhatsApp",
    detail: "+91 90730 45011",
    href: "https://wa.me/919073045011",
    icon: "W",
    color: "bg-[#25D366] hover:bg-[#20bd5a]",
  },
  {
    name: "Telegram",
    detail: "@ingamepinsupport",
    href: "https://t.me/ingamepinsupport",
    icon: "T",
    color: "bg-[#229ED9] hover:bg-[#1b8fc7]",
  },
] as const;

export default function LiveSupportWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const widgetRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function closeWhenClickingOutside(event: MouseEvent) {
      if (!widgetRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function closeWithEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", closeWhenClickingOutside);
    document.addEventListener("keydown", closeWithEscape);

    return () => {
      document.removeEventListener("mousedown", closeWhenClickingOutside);
      document.removeEventListener("keydown", closeWithEscape);
    };
  }, [open]);

  if (pathname.startsWith("/admin")) return null;

  return (
    <div ref={widgetRef} className="fixed bottom-4 right-4 z-[80] sm:bottom-6 sm:right-6">
      {open && (
        <section className="mb-3 w-[calc(100vw-32px)] max-w-xs overflow-hidden rounded-2xl border border-cyan-400/30 bg-slate-950 shadow-2xl shadow-black/40">
          <header className="flex items-center justify-between bg-cyan-400 px-4 py-3 text-slate-950">
            <div>
              <p className="font-black">Contact InGamePin</p>
              <p className="text-xs font-medium">Choose where you want to chat</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} className="rounded-lg px-3 py-1 text-xl font-bold hover:bg-black/10" aria-label="Close contact options">
              ×
            </button>
          </header>

          <div className="space-y-3 bg-slate-900 p-4">
            {supportOptions.map((option) => (
              <a
                key={option.name}
                href={option.href}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 text-white shadow-lg transition hover:-translate-y-0.5 ${option.color}`}
                aria-label={`Chat with InGamePin on ${option.name}`}
              >
                <span aria-hidden="true" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/20 text-lg font-black">
                  {option.icon}
                </span>
                <span>
                  <span className="block font-black">{option.name}</span>
                  <span className="block text-xs font-semibold opacity-90">{option.detail}</span>
                </span>
              </a>
            ))}
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="ml-auto flex h-12 items-center gap-2 rounded-full bg-cyan-400 px-4 text-sm font-black text-slate-950 shadow-xl shadow-black/30 transition hover:scale-105 sm:h-14 sm:px-5 sm:text-base"
        aria-expanded={open}
        aria-label={open ? "Close contact options" : "Open live chat options"}
      >
        <span className="text-xl" aria-hidden="true">●</span>
        Live Chat
      </button>
    </div>
  );
}