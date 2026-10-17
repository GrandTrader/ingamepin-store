import { createClient } from "@/lib/supabase/admin-session";
import { createAdminClient } from "@/lib/supabase/admin";
import { csv, dateBoundary } from "@/lib/business-portal";
import { isReceiptId } from "@/lib/wallet-receipt";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
const failed = (message: string, status: number) => Response.json({ error: message }, { status, headers });
const dateFormatter = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
type Transaction = {
  id: string; user_id: string; transaction_type: string; amount: number | string;
  balance_before: number | string | null; balance_after: number | string | null;
  description: string | null; reference_id: string | null; order_id: string | null; created_at: string;
};
type Identity = { name: string; email: string; currency: string };
function decimal(value: number | string | null) {
  if (value === null) return "";
  if (!Number.isFinite(Number(value))) throw new Error("Unable to export wallet activity. Please try again.");
  return Number(value).toFixed(2);
}

export async function GET(request: Request) {
  const session = await createClient({ reuseVerifiedUser: true });
  const { data: { user } } = await session.auth.getUser();
  if (!user) return failed("Please sign in as an administrator to export wallet activity.", 401);
  const access = await session.from("admin_users").select("user_id").eq("user_id", user.id).maybeSingle();
  if (access.error || !access.data) return failed("Administrator access is required.", 403);

  const params = new URL(request.url).searchParams;
  const keys = ["customer", "from", "to", "type", "reference"];
  if (keys.some(key => params.getAll(key).length > 1)) return failed("Use one value for each export filter.", 400);
  const customer = (params.get("customer") ?? "").toLowerCase();
  if (params.has("customer") && !isReceiptId(customer)) return failed("Choose a valid customer.", 400);
  const from = (params.get("from") ?? "").trim(), to = (params.get("to") ?? "").trim();
  const start = dateBoundary(from), end = dateBoundary(to, true);
  if ((from && !start) || (to && !end)) return failed("Choose valid dates.", 400);
  if (start && end && start >= end) return failed("The end date must be on or after the start date.", 400);
  const type = (params.get("type") ?? "").trim(), reference = (params.get("reference") ?? "").trim();
  if (type && !["CREDIT", "DEBIT"].includes(type)) return failed("Choose a valid activity type.", 400);
  if (reference.length > 150) return failed("The reference can contain up to 150 characters.", 400);

  const admin = createAdminClient();
  const identities = new Map<string, Identity>();
  if (customer) {
    const result = await admin.auth.admin.getUserById(customer);
    if (result.error?.status === 404 || (!result.error && !result.data.user)) return failed("Customer not found.", 404);
    if (result.error) return failed("Unable to load customer details. Please try again.", 503);
    const person = result.data.user!;
    identities.set(customer, { name: String(person.user_metadata?.full_name ?? person.user_metadata?.name ?? person.email ?? "Customer"), email: person.email ?? "", currency: "" });
  }
  const cutoff = new Date().toISOString();
  const encoder = new TextEncoder();
  let cancelled = false;

  async function* chunks() {
    yield encoder.encode(csv([["Transaction ID", "Date (IST)", "Date (UTC)", "Customer ID", "Customer name", "Customer email", "Type", "Amount", "Currency", "Balance before", "Balance after", "Activity", "Reference", "Order ID"]]));
    let cursorId = "", cursorDate = "";
    while (!cancelled && !request.signal.aborted) {
      let query = admin.from("wallet_transactions")
        .select("id,user_id,transaction_type,amount,balance_before,balance_after,description,reference_id,order_id,created_at")
        .lte("created_at", cutoff);
      if (customer) query = query.eq("user_id", customer);
      if (start) query = query.gte("created_at", start);
      if (end) query = query.lt("created_at", end);
      if (type) query = query.eq("transaction_type", type);
      if (reference) query = query.ilike("reference_id", "%" + reference.replace(/[\\%_]/g, "\\$&") + "%");
      // Seek by both fields: new transactions cannot shift pages or duplicate rows.
      if (cursorId) query = query.or("created_at.lt." + cursorDate + ",and(created_at.eq." + cursorDate + ",id.lt." + cursorId + ")");
      const result = await query.order("created_at", { ascending: false }).order("id", { ascending: false }).limit(500).abortSignal(request.signal);
      if (result.error) throw new Error("Unable to export wallet activity. Please try again.");
      const transactions = (result.data ?? []) as Transaction[];
      if (!transactions.length) return;
      const userIds = [...new Set(transactions.map(item => item.user_id))].filter(id => !identities.get(id)?.currency);
      if (userIds.length) {
        const currencies = new Map<string, string>();
        for (let offset = 0; offset < userIds.length; offset += 100) {
          const wallets = await admin.from("customer_wallets").select("user_id,currency").in("user_id", userIds.slice(offset, offset + 100)).abortSignal(request.signal);
          if (wallets.error) throw new Error("Unable to export wallet activity. Please try again.");
          for (const wallet of wallets.data ?? []) currencies.set(wallet.user_id, wallet.currency);
        }
        // Bound directory requests and reuse each identity throughout the export.
        for (let offset = 0; offset < userIds.length; offset += 10) {
          await Promise.all(userIds.slice(offset, offset + 10).map(async id => {
            const known = identities.get(id);
            if (known) { identities.set(id, { ...known, currency: currencies.get(id) ?? "USD" }); return; }
            const result = await admin.auth.admin.getUserById(id);
            if (result.error || !result.data.user) throw new Error("Unable to export customer details. Please try again.");
            const person = result.data.user;
            identities.set(id, { name: String(person.user_metadata?.full_name ?? person.user_metadata?.name ?? person.email ?? "Customer"), email: person.email ?? "", currency: currencies.get(id) ?? "USD" });
          }));
        }
      }
      const rows = transactions.map(item => {
        const identity = identities.get(item.user_id)!;
        return [item.id, dateFormatter.format(new Date(item.created_at)), item.created_at, item.user_id, identity.name, identity.email, item.transaction_type, decimal(item.amount), identity.currency, decimal(item.balance_before), decimal(item.balance_after), item.description ?? "", item.reference_id ?? "", item.order_id ?? ""];
      });
      yield encoder.encode("\r\n" + csv(rows).slice(1));
      const last = transactions[transactions.length - 1];
      if (cursorId === last.id) throw new Error("Unable to finish wallet export. Please try again.");
      cursorId = last.id; cursorDate = last.created_at;
      // Continue until an empty batch, even if the database caps results below 500.
    }
  }

  const iterator = chunks();
  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const next = await iterator.next();
        if (next.done) controller.close(); else controller.enqueue(next.value);
      } catch {
        controller.error(new Error("Unable to finish wallet export. Please try again."));
      }
    },
    async cancel() { cancelled = true; await iterator.return(undefined); },
  });
  const scope = customer ? "customer-" + customer.slice(0, 8) : "all-customers";
  const period = from || to ? (from || "start") + "-to-" + (to || "latest") : type || reference ? "filtered" : "all-history";
  return new Response(stream, { headers: { ...headers, "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="wallet-activity-' + scope + '-' + period + '.csv"' } });
}
