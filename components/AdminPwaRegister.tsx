"use client";

import { useEffect } from "react";

export default function AdminPwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/admin-sw.js", { scope: "/admin" });
  }, []);
  return null;
}
