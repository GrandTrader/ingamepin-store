"use server";
import { requireGiftPortAdmin } from "@/lib/giftport-admin";
import { getGiftPortStatus, giftPortRequest } from "@/lib/giftport-relay";
import type { GiftPortStatus } from "@/lib/giftport-types";
type Result = { error?: string; accepted?: boolean; status?: GiftPortStatus };
export async function readGiftPortStatus(): Promise<Result> {
  await requireGiftPortAdmin();
  try { return { status: await getGiftPortStatus() }; }
  catch (e) { return { error: e instanceof Error ? e.message : "Connection unavailable." }; }
}
export async function connectGiftPort(form: FormData): Promise<Result> {
  await requireGiftPortAdmin();
  const clientId = form.get("clientId"), secretId = form.get("secretId");
  if (typeof clientId !== "string" || typeof secretId !== "string" ||
      !/^[\x21-\x7e]{1,512}$/.test(clientId.trim()) || !/^[\x21-\x7e]{1,512}$/.test(secretId.trim())) return { error: "Enter your Client ID and Secret ID without spaces." };
  try { return await giftPortRequest<{ accepted: boolean }>("configure", { clientId: clientId.trim(), secretId: secretId.trim() }); }
  catch (e) { return { error: e instanceof Error ? e.message : "Connection failed." }; }
}
export async function refreshGiftPort(): Promise<Result> {
  await requireGiftPortAdmin();
  try { return await giftPortRequest<{ accepted: boolean }>("refresh", {}); }
  catch (e) { return { error: e instanceof Error ? e.message : "Refresh failed." }; }
}
