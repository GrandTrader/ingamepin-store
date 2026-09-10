import { isIP } from "node:net";
// Trust only the hosting edge's overwritten header. Local/unconfigured hosts are unavailable.
export function sellerSubmissionIp(headers: {get(name: string): string | null}, onVercel: boolean): string | null {
  if (!onVercel) return null;
  const value = headers.get("x-forwarded-for")?.trim() ?? "";
  return isIP(value) ? value : null;
}
