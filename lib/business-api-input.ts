import { isIP } from "node:net";

export function normalizeApiIp(value: string) {
  const ip = value.trim();
  if (!isIP(ip)) throw Error("Enter valid IPv4 or IPv6 addresses, one per line. Network ranges are not supported.");
  return isIP(ip) === 6 ? new URL(`http://[${ip}]/`).hostname.slice(1,-1) : ip;
}

export function apiAllowedIps(value: string) {
  const ips = [...new Set(value.split(/[\s,]+/).filter(Boolean).map(normalizeApiIp))];
  if (!ips.length || ips.length > 20) throw Error("Add between 1 and 20 allowed IP addresses.");
  return ips;
}

export function businessApiIp(headers: Headers) {
  // Vercel supplies this header at its edge. Never trust client-supplied CF/XFF headers.
  if (process.env.VERCEL === "1") {
    const value = headers.get("x-vercel-forwarded-for");
    return value ? normalizeApiIp(value) : null;
  }
  // Local preview is not a publicly supported API deployment.
  if (process.env.NODE_ENV === "development") return "127.0.0.1";
  return null;
}

export function apiPage(value: string | null) {
  const page = Number(value ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw Error("Invalid page.");
  return page;
}
