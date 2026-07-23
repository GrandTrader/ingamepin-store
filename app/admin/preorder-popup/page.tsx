import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import AdminSidebar from "../AdminSidebar";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { savePreorderPopup } from "./actions";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

type PopupSettings = {
  is_enabled: boolean;
  product_id: string | null;
  game_title: string;
  image_url: string;
  launch_date: string | null;
  preorder_price: number | string | null;
  bonus_text: string;
  button_text: string;
};

type ProductRow = {
  id: string;
  name: string;
  slug: string;
};

function dateTimeLocal(
  value: string | null,
) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  return new Date(
    date.getTime() + 330 * 60_000,
  )
    .toISOString()
    .slice(0, 16);
}

export default async function PreorderPopupPage({
  searchParams,
}: PageProps) {
  const { error, success } =
    await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const adminUser = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminUser.data) {
    redirect("/admin/login?error=Access denied");
  }

  const admin = createAdminClient();
  const [settingsResult, productsResult] =
    await Promise.all([
      admin
        .from("preorder_popup_settings")
        .select(
          "is_enabled, product_id, game_title, image_url, launch_date, preorder_price, bonus_text, button_text",
        )
        .eq("id", true)
        .maybeSingle(),
      admin
        .from("products")
        .select("id, name, slug")
        .eq("status", "ACTIVE")
        .order("name"),
    ]);

  if (settingsResult.error) {
    throw new Error(
      `Unable to load popup settings: ${settingsResult.error.message}`,
    );
  }

  if (productsResult.error) {
    throw new Error(
      `Unable to load products: ${productsResult.error.message}`,
    );
  }

  const settings =
    settingsResult.data as PopupSettings | null;
  const products =
    (productsResult.data ?? []) as ProductRow[];

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col md:flex-row">
        <AdminSidebar />

        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header>
            <h1 className="text-3xl font-black">
              Preorder popup
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              Control the game preorder notice shown
              on the store homepage.
            </p>
          </header>

          {error && (
            <div className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-700">
              {success}
            </div>
          )}

          <form
            action={savePreorderPopup}
            className="mt-8 max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-7"
          >
            <label className="flex items-center justify-between gap-5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              <span>
                <span className="block font-black">
                  Show preorder popup
                </span>
                <span className="mt-1 block text-sm text-slate-500">
                  Switch this off to hide it
                  immediately.
                </span>
              </span>

              <input
                type="checkbox"
                name="is_enabled"
                defaultChecked={
                  settings?.is_enabled ?? false
                }
                className="h-6 w-6 accent-cyan-500"
              />
            </label>

            <div className="mt-6 grid gap-5 sm:grid-cols-2">
              <Field label="Product">
                <select
                  name="product_id"
                  defaultValue={
                    settings?.product_id ?? ""
                  }
                  className={inputClass}
                >
                  <option value="">
                    Select a product
                  </option>
                  {products.map((product) => (
                    <option
                      key={product.id}
                      value={product.id}
                    >
                      {product.name}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Game title">
                <input
                  name="game_title"
                  maxLength={120}
                  defaultValue={
                    settings?.game_title ?? ""
                  }
                  placeholder="Game title"
                  className={inputClass}
                />
              </Field>

              <Field label="Image URL" wide>
                <input
                  type="url"
                  name="image_url"
                  defaultValue={
                    settings?.image_url ?? ""
                  }
                  placeholder="https://..."
                  className={inputClass}
                />
              </Field>

              <Field label="Launch date and time (India)">
                <input
                  type="datetime-local"
                  name="launch_date"
                  defaultValue={dateTimeLocal(
                    settings?.launch_date ?? null,
                  )}
                  className={inputClass}
                />
              </Field>

              <Field label="Preorder price (USD)">
                <input
                  type="number"
                  name="preorder_price"
                  min="0"
                  step="0.01"
                  defaultValue={
                    settings?.preorder_price ?? ""
                  }
                  placeholder="59.99"
                  className={inputClass}
                />
              </Field>

              <Field label="Bonus text">
                <input
                  name="bonus_text"
                  maxLength={160}
                  defaultValue={
                    settings?.bonus_text ?? ""
                  }
                  placeholder="Preorder Bonus Included"
                  className={inputClass}
                />
              </Field>

              <Field label="Button text">
                <input
                  name="button_text"
                  maxLength={40}
                  defaultValue={
                    settings?.button_text ??
                    "PREORDER NOW"
                  }
                  className={inputClass}
                />
              </Field>
            </div>

            <button
              type="submit"
              className="mt-7 rounded-xl bg-cyan-500 px-6 py-3 font-black text-slate-950 transition hover:bg-cyan-400"
            >
              Save popup settings
            </button>
          </form>
        </main>
      </div>
    </div>
  );
}

const inputClass =
  "mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-100";

function Field({
  label,
  wide = false,
  children,
}: {
  label: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return (
    <label
      className={
        wide ? "sm:col-span-2" : ""
      }
    >
      <span className="text-sm font-bold text-slate-700">
        {label}
      </span>
      {children}
    </label>
  );
}
