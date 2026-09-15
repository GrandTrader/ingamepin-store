export async function readWalletTopupResponse(response: Response): Promise<{ checkoutUrl: string }> {
  const fallback = response.status === 401
    ? "Please sign in again to continue."
    : response.status === 429
      ? "Too many payment requests. Please wait a moment and try again."
      : "The payment service is temporarily unavailable. Refresh the page and try again. If this continues, contact support.";
  let result: unknown;
  try { result = await response.json(); } catch { throw new Error(fallback); }
  if (!result || typeof result !== "object" || Array.isArray(result)) throw new Error(fallback);
  const data = result as { error?: unknown; checkoutUrl?: unknown };
  if (!response.ok) throw new Error(typeof data.error === "string" && !data.error.includes("<!DOCTYPE") && !data.error.includes("Unexpected token") ? data.error : fallback);
  if (typeof data.checkoutUrl !== "string" || !data.checkoutUrl.trim()) throw new Error(fallback);
  const url = new URL(data.checkoutUrl, "https://www.ingamepin.com");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) throw new Error(fallback);
  return { checkoutUrl: data.checkoutUrl };
}
