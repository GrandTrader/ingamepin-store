"use client";
import { useEffect, useState } from "react";
type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
export default function InstallCustomerAppButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null); const [installed, setInstalled] = useState(false);
  useEffect(() => { if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true); const handlePrompt = (event: Event) => { event.preventDefault(); setPromptEvent(event as InstallPromptEvent); }; const handleInstalled = () => { setInstalled(true); setPromptEvent(null); }; window.addEventListener("beforeinstallprompt", handlePrompt); window.addEventListener("appinstalled", handleInstalled); return () => { window.removeEventListener("beforeinstallprompt", handlePrompt); window.removeEventListener("appinstalled", handleInstalled); }; }, []);
  if (installed) return <span className="rounded-xl bg-emerald-100 px-4 py-2.5 text-sm font-bold text-emerald-700">Customer App Installed</span>;
  return <button type="button" disabled={!promptEvent} onClick={async () => { if (!promptEvent) return; await promptEvent.prompt(); const choice = await promptEvent.userChoice; if (choice.outcome === "accepted") setPromptEvent(null); }} className="rounded-xl bg-cyan-500 px-5 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-400 disabled:cursor-not-allowed disabled:bg-slate-300">Install Customer App</button>;
}
