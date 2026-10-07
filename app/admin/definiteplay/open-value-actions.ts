"use server";
import { requireDefinitePlayAdmin } from "@/lib/definiteplay-admin";
import { getOpenValueConnection } from "@/lib/definiteplay-open-value-connection";

export async function loadOpenValueProducts() {
  await requireDefinitePlayAdmin();
  try { return { data: await getOpenValueConnection(), error: "" }; }
  catch { return { data: null, error: "Custom-value supplier catalogue is unavailable. Please try again." }; }
}
