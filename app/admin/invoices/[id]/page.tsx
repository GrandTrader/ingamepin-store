import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { InvoicePreview, type InvoiceData } from "../InvoiceBuilder";
import PrintSavedInvoiceButton from "./PrintSavedInvoiceButton";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type SavedInvoicePageProps = {
  params: Promise<{ id: string }>;
};

export default async function SavedInvoicePage({ params }: SavedInvoicePageProps) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/admin/login");

  const access = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!access.data) redirect("/admin/login?error=Access denied");

  const { id } = await params;
  const result = await createAdminClient()
    .from("saved_invoices")
    .select("invoice_data")
    .eq("id", id)
    .maybeSingle();

  if (result.error || !result.data) notFound();
  const invoice = result.data.invoice_data as InvoiceData;

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 print:bg-white print:p-0">
      <div className="mx-auto flex max-w-[900px] justify-between gap-4 print:hidden">
        <Link
          href="/admin/invoices/history"
          className="rounded-xl border border-slate-200 bg-white px-5 py-3 font-black text-slate-700"
        >
          ← Invoice history
        </Link>
        <PrintSavedInvoiceButton />
      </div>
      <InvoicePreview invoice={invoice} />
    </main>
  );
}
