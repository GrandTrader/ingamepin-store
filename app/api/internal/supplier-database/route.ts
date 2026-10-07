import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;
const headers = { "Cache-Control": "private, no-store", "Content-Type": "application/json" };
const maxBody = 2 * 1024 * 1024;
const common = {
  mark_definiteplay_submitted: ["p_item_id", "p_token"],
  update_definiteplay_job: ["p_item_id", "p_token", "p_state", "p_issue"],
};
const operations: Record<string, Record<string, string[]>> = {
  DEFINITEPLAY: {
    ...common, claim_definiteplay_job: [],
    sync_definiteplay_stock: ["p_rows", "p_synced_at"],
    complete_definiteplay_job: ["p_item_id", "p_token", "p_codes", "p_actual_cost"],
    claim_digiseller_supplier_job: [],
    mark_digiseller_supplier_submitted: ["p_invoice_id", "p_token"],
    update_digiseller_supplier_job: ["p_invoice_id", "p_token", "p_state", "p_issue"],
    complete_digiseller_supplier_job: ["p_invoice_id", "p_token", "p_codes", "p_actual_cost"],
  },
};
function failure(status: number) {
  return new Response(JSON.stringify({ error: "Supplier database request unavailable" }), { status, headers });
}
async function readBounded(stream: ReadableStream<Uint8Array> | null, limit: number) {
  if (!stream) return Buffer.alloc(0);
  const reader = stream.getReader();
  const parts: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      length += part.value.byteLength;
      if (length > limit) throw new Error("Size limit");
      parts.push(part.value);
    }
    return Buffer.concat(parts);
  } finally {
    await reader.cancel().catch(() => {});
  }
}
function authenticate(request: Request, body: Buffer) {
  const provider = request.headers.get("x-supplier-provider") ?? "";
  if (!Object.hasOwn(operations, provider)) return null;
  const secret = process.env.DEFINITEPLAY_RELAY_SECRET;
  const stamp = request.headers.get("x-supplier-time") ?? "";
  const signature = request.headers.get("x-supplier-signature") ?? "";
  if (!secret || secret.length < 32 || !/^\d{10}$/.test(stamp) ||
      Math.abs(Date.now() / 1000 - Number(stamp)) > 60 || !/^[a-f0-9]{64}$/.test(signature)) return null;
  const digest = createHash("sha256").update(body).digest("hex");
  const message = ["supplier-database-v1", provider, request.method, stamp, digest].join("\n");
  const expected = createHmac("sha256", secret).update(message).digest();
  return timingSafeEqual(Buffer.from(signature, "hex"), expected) ? provider : null;
}
async function upstream(path: string, method: string, body?: string) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url?.startsWith("https://") || !key) throw new Error("Missing configuration");
  // Fixed database origin, explicit function allowlist, and no redirects or retries.
  return fetch(url.replace(/\/$/, "") + "/rest/v1/" + path, {
    method, body, headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000),
  });
}
export async function GET(request: Request) {
  if (!authenticate(request, Buffer.alloc(0))) return failure(401);
  try {
    const response = await upstream("definiteplay_jobs?select=item_id&limit=0", "HEAD");
    return response.ok ? new Response('{"ready":true}', { headers }) : failure(503);
  } catch { return failure(503); }
}
export async function POST(request: Request) {
  // Reject unsigned traffic before reading bodies or touching the database.
  if (!request.headers.has("x-supplier-signature")) return failure(401);
  if (Number(request.headers.get("content-length")) > maxBody) return failure(413);
  let raw: Buffer;
  try { raw = await readBounded(request.body, maxBody); } catch { return failure(413); }
  const provider = authenticate(request, raw);
  if (!provider) return failure(401);
  let input: { name: string; args: Record<string, unknown> };
  try {
    input = JSON.parse(raw.toString("utf8"));
    if (!input || typeof input !== "object" || Object.keys(input).sort().join(",") !== "args,name" ||
        typeof input.name !== "string" || !Object.hasOwn(operations[provider], input.name) ||
        !input.args || typeof input.args !== "object" || Array.isArray(input.args)) return failure(400);
    const fields = operations[provider][input.name];
    if (Object.keys(input.args).sort().join(",") !== [...fields].sort().join(",")) return failure(400);
  } catch { return failure(400); }
  try {
    const response = await upstream("rpc/" + input.name, "POST", JSON.stringify(input.args));
    if (!response.ok) { await response.body?.cancel(); return failure(502); }
    const result = await readBounded(response.body, 4 * 1024 * 1024);
    // Preserve numeric precision and return only the RPC result. Never log codes.
    return new Response(result.length ? result.toString("utf8") : "null", { headers });
  } catch { return failure(502); }
}
