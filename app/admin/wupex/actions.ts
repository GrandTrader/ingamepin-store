"use server";
import { revalidatePath } from "next/cache";
import { requireWupexAdmin } from "@/lib/wupex-admin";
import { getWupexBalance, getWupexCatalog, getWupexPreorderStatus, validateWupexCredentials, WUPEX_SANDBOX_URL, WupexError } from "@/lib/wupex-api";
import { readWupexCredentials, requireWupexCredentials, sealWupexCredentials, wupexEnvironmentConfigured } from "@/lib/wupex-storage";
import type { WupexAction, WupexCatalog, WupexDashboard } from "@/lib/wupex-types";

function safeError(error: unknown): string {
  return error instanceof WupexError ? error.message : "Wupex could not complete this action. Check the connection and database setup.";
}
export async function loadWupexDashboard(): Promise<WupexDashboard> {
  const { db } = await requireWupexAdmin();
  const dashboard: WupexDashboard = { databaseReady: false, connected: false, configuredByEnvironment: wupexEnvironmentConfigured(), baseUrl: null, sandbox: true, balance: null, preorderEnabled: null, errors: [] };
  const check = await db.from("wupex_settings").select("id").limit(1);
  dashboard.databaseReady = !check.error;
  if (check.error) dashboard.errors.push("Install the Wupex database update before saving a connection.");
  try {
    const credentials = await readWupexCredentials();
    if (!credentials) return dashboard;
    dashboard.baseUrl = credentials.baseUrl;
    dashboard.sandbox = credentials.baseUrl === WUPEX_SANDBOX_URL;
    const [balance, preorder] = await Promise.allSettled([getWupexBalance(credentials), getWupexPreorderStatus(credentials)]);
    if (balance.status === "fulfilled") { dashboard.balance = balance.value; dashboard.connected = true; }
    else dashboard.errors.push(safeError(balance.reason));
    if (preorder.status === "fulfilled") dashboard.preorderEnabled = preorder.value;
    else dashboard.errors.push(safeError(preorder.reason));
  } catch (error) { dashboard.errors.push(safeError(error)); }
  return dashboard;
}
export async function connectWupex(form: FormData): Promise<WupexAction<boolean>> {
  const { db, userId } = await requireWupexAdmin();
  try {
    if (wupexEnvironmentConfigured()) throw new WupexError("This connection uses server environment settings. Update those settings on the server.");
    const credentials = validateWupexCredentials({
      baseUrl: String(form.get("baseUrl") ?? ""),
      apiKey: String(form.get("apiKey") ?? ""),
      merchantCode: String(form.get("merchantCode") ?? ""),
    });
    // Verify access using reads only. Connecting cannot place an order or spend a balance.
    await getWupexBalance(credentials);
    const saved = await db.from("wupex_settings").upsert({
      id: true, credentials_ciphertext: sealWupexCredentials(credentials), updated_by: userId, updated_at: new Date().toISOString(),
    });
    if (saved.error) throw new WupexError("Wupex access was verified, but the connection could not be saved. Install the database update first.");
    revalidatePath("/admin/wupex");
    return { data: true };
  } catch (error) { return { error: safeError(error) }; }
}
export async function loadWupexProducts(page: number, query: string, kind: string): Promise<WupexAction<WupexCatalog>> {
  await requireWupexAdmin();
  try { return { data: await getWupexCatalog(await requireWupexCredentials(), page, query, kind) }; }
  catch (error) { return { error: safeError(error) }; }
}
