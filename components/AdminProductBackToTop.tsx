"use client";

import { useEffect, useState } from "react";

export default function AdminProductBackToTop() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const updateVisibility = () => setVisible(window.scrollY > 500);
    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    return () => window.removeEventListener("scroll", updateVisibility);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      aria-label="Back to top"
      title="Back to top"
      className="fixed bottom-24 right-5 z-40 flex h-12 w-12 items-center justify-center rounded-full border border-cyan-300 bg-slate-900 text-2xl font-black text-white shadow-xl transition hover:-translate-y-1 hover:bg-cyan-500 focus:outline-none focus:ring-4 focus:ring-cyan-200 sm:bottom-8 sm:right-8"
    >
      ↑
    </button>
  );
}
