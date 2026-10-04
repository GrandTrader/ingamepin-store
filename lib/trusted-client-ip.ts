import { isIP } from "node:net";

export function trustedClientIp(headers: Headers): string | null {
  if (process.env.VERCEL === "1") {
    const value = headers.get("x-vercel-forwarded-for")?.trim();
    if (!value || !isIP(value)) return null;
    return isIP(value) === 6 ? new URL(`http://[${value}]/`).hostname.slice(1, -1) : value;
  }
  return process.env.NODE_ENV === "development" ? "127.0.0.1" : null;
}
