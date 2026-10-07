import "server-only";

const loopbackHosts = new Set(["localhost", "127.0.0.1", "[::1]"]);

/** Validate the browser origin and return the same trusted origin for PayPal callbacks. */
export function paypalRequestOrigin(request: Request): string | null {
  const origin = request.headers.get("origin");
  if (!origin || request.headers.get("sec-fetch-site") === "cross-site") return null;
  try {
    const requestUrl = new URL(request.url);
    const host = request.headers.get("host")?.toLowerCase();
    let expected = requestUrl.origin;
    // Next dev constructs request.url with the bind address even when the browser
    // uses the configured retail hostname. Never trust forwarded host headers.
    const configuredRetail = process.env.NEXT_PUBLIC_RETAIL_SITE_URL?.trim();
    if (process.env.NODE_ENV === "development" && loopbackHosts.has(requestUrl.hostname) && configuredRetail) {
      const retail = new URL(configuredRetail);
      const local = loopbackHosts.has(retail.hostname) || retail.hostname.endsWith(".localhost");
      if (retail.origin === configuredRetail && local && retail.protocol === requestUrl.protocol
        && retail.port === requestUrl.port && host === retail.host.toLowerCase()) {
        expected = retail.origin;
      }
    }
    if (origin !== expected || (host && host !== new URL(expected).host.toLowerCase())) return null;
    return expected;
  } catch {
    return null;
  }
}
