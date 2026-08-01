"use client";
import { useEffect } from "react";
export default function AccountPwaRegister() {
  useEffect(() => { if ("serviceWorker" in navigator) navigator.serviceWorker.register("/account-sw.js", { scope: "/account" }); }, []);
  return null;
}
