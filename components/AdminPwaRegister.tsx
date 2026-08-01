"use client";

import { useEffect, useState } from "react";

function decodeKey(value: string) {
  const padded = value.padEnd(value.length + (4 - value.length % 4) % 4, "=").replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
}

export default function AdminPwaRegister() {
  const [available, setAvailable] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [working, setWorking] = useState(false);
  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return;
    setAvailable(true);
    navigator.serviceWorker.register("/admin-sw.js", { scope: "/admin" }).then(async (registration) => {
      setEnabled(Boolean(await registration.pushManager.getSubscription()));
    });
  }, []);

  async function enableNotifications() {
    setWorking(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") throw new Error("Notification permission was not allowed.");
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) {
        const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
        if (!publicKey) throw new Error("Push notifications are not configured.");
        subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: decodeKey(publicKey) });
      }
      const response = await fetch("/api/admin/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription.toJSON()) });
      if (!response.ok) throw new Error("Unable to save this device.");
      setEnabled(true);
    } catch (error) { alert(error instanceof Error ? error.message : "Unable to enable notifications."); }
    finally { setWorking(false); }
  }

  async function testNotification() {
    setWorking(true);
    try {
      const response = await fetch("/api/admin/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ test: true }) });
      if (!response.ok) throw new Error("Unable to send test notification.");
    } catch (error) { alert(error instanceof Error ? error.message : "Unable to send test notification."); }
    finally { setWorking(false); }
  }

  if (!available) return null;
  return <button type="button" onClick={enabled ? testNotification : enableNotifications} disabled={working} className="fixed bottom-5 right-5 z-[100] rounded-full bg-blue-600 px-5 py-3 text-sm font-black text-white shadow-xl disabled:opacity-60">{working ? "Sending..." : enabled ? "🔔 Test notification" : "🔔 Enable notifications"}</button>;
}
