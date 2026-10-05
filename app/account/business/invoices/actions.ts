"use server";
import { validateInvoiceBilling } from "@/lib/invoice-billing";
import { businessSessionReady } from "@/lib/business-security";
import { createClient } from "@/lib/supabase/server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { requireCustomer } from "@/lib/customer-account-data";
import { createAdminClient } from "@/lib/supabase/admin";
import { bankInvoiceAmount, bankInvoiceId } from "@/lib/bank-deposit-invoice";
import { BUSINESS_BUCKET, readBusinessFile } from "@/lib/business-verification";

export async function generateBankInvoice(form: FormData) {
  const { user } = await requireCustomer();
  const amount = bankInvoiceAmount(form.get("amount")), id = String(form.get("request_id") ?? "");
  if (amount === null || !bankInvoiceId.test(id)) return { error: "Enter USD 10–50,000 with at most two decimal places." };
  if (!(await businessSessionReady(await createClient(),user.id))) return {error:"Complete business account security verification before generating an invoice."};
  let billing;
  try { billing=validateInvoiceBilling({fullName:"Business customer",companyName:"",...Object.fromEntries(["country","addressLine1","addressLine2","city","state","postalCode","taxpayerId"].map(key=>[key,form.get(key)]))},true); }
  catch(error) { return {error:error instanceof Error?error.message:"Enter complete billing details."}; }
  const result = await createAdminClient().rpc("create_business_bank_invoice_with_billing", { p_id: id, p_user: user.id, p_amount: amount, p_billing: billing });
  if (result.error) return { error: result.error.code === "P0001" ? result.error.message : "Unable to generate the invoice. Please retry; the same request will not create a duplicate." };
  return { invoiceId: result.data as string };
}

export async function submitInvoiceTransfer(form: FormData) {
  const { user } = await requireCustomer();
  const db = createAdminClient(), invoiceId = String(form.get("invoice_id") ?? ""), reference = String(form.get("reference") ?? "").trim();
  if (!bankInvoiceId.test(invoiceId) || reference.length < 3 || reference.length > 100) return { error: "Enter a valid invoice and bank transfer reference (3–100 characters)." };
  let path: string | null = null, attempted = false;
  try {
    const [invoice, existing] = await Promise.all([
      db.from("business_bank_invoices").select("id").eq("id", invoiceId).eq("user_id", user.id).maybeSingle(),
      db.from("business_bank_deposits").select("id").eq("invoice_id", invoiceId).eq("user_id", user.id).maybeSingle(),
    ]);
    if (invoice.error || existing.error) throw Error("Unable to check the invoice. Please retry.");
    if (!invoice.data) return { error: "Invoice not found." };
    if (!existing.data) {
      const file = await readBusinessFile(form.get("receipt"));
      path = `${user.id}/${randomUUID()}.${file.ext}`;
      const upload = await db.storage.from(BUSINESS_BUCKET).upload(path, file.bytes, { contentType: file.mime, upsert: false });
      if (upload.error) throw Error("Unable to upload the receipt. Please retry.");
      attempted = true;
      const result = await db.rpc("submit_business_invoice_deposit", { p_id: randomUUID(), p_user: user.id, p_invoice: invoiceId, p_reference: reference, p_receipt: path });
      if (result.error?.code === "P0001" || result.error?.code === "23505") attempted = false;
      if (result.error) throw Error(result.error.code === "P0001" ? result.error.message : "Unable to confirm submission. Retry safely; this invoice cannot create a duplicate deposit.");
      // A concurrent retry can return an earlier deposit; remove only our unused upload.
      const saved = await db.from("business_bank_deposits").select("receipt_path").eq("id", result.data).eq("user_id", user.id).single();
      if (!saved.error && saved.data.receipt_path !== path) await db.storage.from(BUSINESS_BUCKET).remove([path]);
    }
  } catch (error) {
    if (path && !attempted) await db.storage.from(BUSINESS_BUCKET).remove([path]);
    return { error: error instanceof Error ? error.message : "Unable to submit the receipt." };
  }
  for (const base of ["/account/business", "/account/portal/business"]) {
    revalidatePath(base); revalidatePath(`${base}/invoices/${invoiceId}`);
  }
  revalidatePath("/admin/business-verification/deposits");
  return { success: "Transfer submitted for review. Your wallet is credited after the bank receipt is verified." };
}
