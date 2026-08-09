import { redirect } from "next/navigation";

import AdminSidebar from "../AdminSidebar";
import InvoiceBuilder from "./InvoiceBuilder";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type CategoryRow = {
  id: string;
  name: string;
};

type ProductRow = {
  id: string;
  name: string;
  category_id: string;
};

type ProductOptionRow = {
  id: string;
  product_id: string;
  option_name: string;
  denomination: number | string | null;
  denomination_currency: string | null;
  sort_order: number;
};

function createInvoiceNumber(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const time = [date.getHours(), date.getMinutes(), date.getSeconds()]
    .map((value) => String(value).padStart(2, "0"))
    .join("");

  return `AG-${year}${month}${day}-${time}`;
}

function createDateValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default async function InvoicesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const access = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!access.data) {
    redirect("/admin/login?error=Access denied");
  }

  const admin = createAdminClient();
  const [categoryResult, productResult, optionResult] = await Promise.all([
    admin
      .from("categories")
      .select("id, name")
      .eq("is_active", true)
      .order("sort_order")
      .order("name"),
    admin
      .from("products")
      .select("id, name, category_id")
      .eq("status", "ACTIVE")
      .order("name"),
    admin
      .from("product_options")
      .select(
        "id, product_id, option_name, denomination, denomination_currency, sort_order",
      )
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  if (categoryResult.error) {
    throw new Error(
      `Unable to load invoice categories: ${categoryResult.error.message}`,
    );
  }

  if (productResult.error) {
    throw new Error(
      `Unable to load invoice products: ${productResult.error.message}`,
    );
  }

  if (optionResult.error) {
    throw new Error(
      `Unable to load invoice denominations: ${optionResult.error.message}`,
    );
  }

  const categories = (categoryResult.data ?? []) as CategoryRow[];
  const products = (productResult.data ?? []) as ProductRow[];
  const options = (optionResult.data ?? []) as ProductOptionRow[];
  const now = new Date();

  return (
    <div className="min-h-screen bg-white text-slate-900 print:bg-white">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col lg:flex-row print:block print:max-w-none">
        <div className="print:hidden">
          <AdminSidebar />
        </div>

        <main className="min-w-0 flex-1 p-5 sm:p-8 print:p-0">
          <InvoiceBuilder
            categories={categories}
            products={products}
            options={options}
            defaultInvoiceNumber={createInvoiceNumber(now)}
            defaultInvoiceDate={createDateValue(now)}
          />
        </main>
      </div>
    </div>
  );
}
