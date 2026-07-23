import { redirect } from "next/navigation";

import AdminSidebar from "../AdminSidebar";
import { createClient } from "@/lib/supabase/server";
import AddGiftCodesSection from "./AddGiftCodesSection";
import ExportCodes from "./ExportCodes";
import {
  changeGiftCodeStatus,
} from "./actions";

export const dynamic = "force-dynamic";

type GiftCodePageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

type ProductRow = {
  id: string;
  name: string;
};

type GiftCodeRow = {
  id: string;
  code: string;
  denomination: number | null;
  status:
    | "AVAILABLE"
    | "RESERVED"
    | "SOLD"
    | "DISABLED";
  note: string | null;
  created_at: string;
  products:
    | {
        name: string;
      }
    | {
        name: string;
      }[]
    | null;
};

function getProductName(
  product: GiftCodeRow["products"],
) {
  if (Array.isArray(product)) {
    return (
      product[0]?.name ?? "Unknown product"
    );
  }

  return product?.name ?? "Unknown product";
}

function maskCode(code: string) {
  if (code.length <= 8) {
    return "********";
  }

  return `${code.slice(0, 4)}****${code.slice(-4)}`;
}

function getStatusClass(
  status: GiftCodeRow["status"],
) {
  switch (status) {
    case "AVAILABLE":
      return "bg-emerald-100 text-emerald-700";

    case "RESERVED":
      return "bg-amber-100 text-amber-700";

    case "SOLD":
      return "bg-blue-100 text-blue-700";

    default:
      return "bg-slate-200 text-slate-600";
  }
}

export default async function GiftCodesPage({
  searchParams,
}: GiftCodePageProps) {
  const { error, success } =
    await searchParams;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const adminResult = await supabase
    .from("admin_users")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminResult.data) {
    redirect("/admin/login?error=Access denied");
  }

  const [productResult, codeResult] =
    await Promise.all([
      supabase
        .from("products")
        .select("id, name")
        .eq("status", "ACTIVE")
        .order("name"),

      supabase
        .from("gift_card_codes")
        .select(
          `
            id,
            code,
            denomination,
            status,
            note,
            created_at,
            products (
              name
            )
          `,
        )
        .order("created_at", {
          ascending: false,
        })
        .limit(200),
    ]);

  if (productResult.error) {
    throw new Error(
      `Unable to load products: ${productResult.error.message}`,
    );
  }

  if (codeResult.error) {
    throw new Error(
      `Unable to load codes: ${codeResult.error.message}`,
    );
  }

  const products =
    (productResult.data ?? []) as ProductRow[];

  const giftCodes =
    (codeResult.data ?? []) as GiftCodeRow[];

  const availableCount = giftCodes.filter(
    (item) => item.status === "AVAILABLE",
  ).length;

  const reservedCount = giftCodes.filter(
    (item) => item.status === "RESERVED",
  ).length;

  const soldCount = giftCodes.filter(
    (item) => item.status === "SOLD",
  ).length;

  const disabledCount = giftCodes.filter(
    (item) => item.status === "DISABLED",
  ).length;

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <div className="mx-auto flex min-h-screen max-w-[1500px] flex-col md:flex-row">
        <AdminSidebar />

        <main className="min-w-0 flex-1 p-5 sm:p-8">
          <header>
            <h1 className="text-3xl font-black">
              Gift-card inventory
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              Add codes, export product inventory and
              control code availability.
            </p>
          </header>

          <section className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <InventoryCard
              label="Available"
              value={availableCount}
              color="text-emerald-600"
            />

            <InventoryCard
              label="Reserved"
              value={reservedCount}
              color="text-amber-600"
            />

            <InventoryCard
              label="Sold"
              value={soldCount}
              color="text-blue-600"
            />

            <InventoryCard
              label="Disabled"
              value={disabledCount}
              color="text-slate-600"
            />
          </section>

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

          <div className="mt-8">
            <ExportCodes products={products} />
          </div>

          <div className="mt-8">
            <AddGiftCodesSection />
          </div>

          <section className="mt-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-200 p-5 sm:p-6">
              <h2 className="text-xl font-black">
                Recent inventory
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                Showing up to 200 recent codes.
                Sensitive codes remain masked.
              </p>
            </div>

            <div className="divide-y divide-slate-200">
              {giftCodes.map((giftCode) => (
                <div
                  key={giftCode.id}
                  className="grid gap-4 p-5 transition hover:bg-blue-50/40 sm:p-6 lg:grid-cols-[minmax(0,1fr)_160px_auto]"
                >
                  <div>
                    <p className="font-bold">
                      {getProductName(
                        giftCode.products,
                      )}
                    </p>

                    <p className="mt-1 font-mono text-sm text-slate-500">
                      {maskCode(giftCode.code)}
                    </p>

                    {giftCode.note && (
                      <p className="mt-2 text-xs text-slate-400">
                        {giftCode.note}
                      </p>
                    )}
                  </div>

                  <div>
                    <p className="text-sm text-slate-500">
                      Denomination
                    </p>

                    <p className="mt-1 font-black">
                      ₹
                      {(
                        giftCode.denomination ?? 0
                      ).toLocaleString("en-IN")}
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-bold ${getStatusClass(
                        giftCode.status,
                      )}`}
                    >
                      {giftCode.status}
                    </span>

                    {(giftCode.status ===
                      "AVAILABLE" ||
                      giftCode.status ===
                        "DISABLED") && (
                      <form
                        action={changeGiftCodeStatus}
                      >
                        <input
                          type="hidden"
                          name="id"
                          value={giftCode.id}
                        />

                        <input
                          type="hidden"
                          name="status"
                          value={
                            giftCode.status ===
                            "AVAILABLE"
                              ? "DISABLED"
                              : "AVAILABLE"
                          }
                        />

                        <button
                          type="submit"
                          className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-600"
                        >
                          {giftCode.status ===
                          "AVAILABLE"
                            ? "Disable"
                            : "Enable"}
                        </button>
                      </form>
                    )}
                  </div>
                </div>
              ))}

              {giftCodes.length === 0 && (
                <p className="p-10 text-center text-slate-500">
                  No gift-card codes have been added.
                </p>
              )}
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

type InventoryCardProps = {
  label: string;
  value: number;
  color: string;
};

function InventoryCard({
  label,
  value,
  color,
}: InventoryCardProps) {
  return (
    <div className="rounded-2xl bg-slate-100 p-5">
      <p className="text-sm text-slate-500">
        {label}
      </p>

      <p
        className={`mt-2 text-3xl font-black ${color}`}
      >
        {value}
      </p>
    </div>
  );
}
