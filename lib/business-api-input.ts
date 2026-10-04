import { isIP } from "node:net";
import { trustedClientIp } from "@/lib/trusted-client-ip";

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
  return trustedClientIp(headers);
}

export function apiPage(value: string | null) {
  const page = Number(value ?? 1);
  if (!Number.isSafeInteger(page) || page < 1 || page > 10000) throw Error("Invalid page.");
  return page;
}
