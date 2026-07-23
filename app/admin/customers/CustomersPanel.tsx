"use client";

import {
  type ReactNode,
  useMemo,
  useState,
} from "react";

import { saveCustomerDiscount } from "./actions";

export type CustomerProduct = {
  id: string;
  name: string;
  productType: string;
};

export type AdminCustomer = {
  id: string;
  name: string;
  email: string;
  phone: string;
  verified: boolean;
  walletBalance: number;
  walletCurrency: string;
  orderCount: number;
  totalSpent: number;
  registeredAt: string;
  lastSignInAt: string | null;
  currentCountryCode: string | null;
  previousCountryCode: string | null;
  currentCountryAt: string | null;
  productDiscounts: Array<{
    productId: string;
    discountPercent: number;
  }>;
};

type CustomersPanelProps = {
  customers: AdminCustomer[];
  products: CustomerProduct[];
  initialSelectedId?: string;
};

function formatMoney(
  value: number,
  currency = "USD",
) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function csvValue(value: string | number) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

export default function CustomersPanel({
  customers,
  products,
  initialSelectedId,
}: CustomersPanelProps) {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<
    "all" | "verified" | "unverified"
  >("all");
  const [selectedId, setSelectedId] =
    useState<string | null>(
      initialSelectedId &&
        customers.some(
          (customer) =>
            customer.id === initialSelectedId,
        )
        ? initialSelectedId
        : null,
    );
  const [discountEditorOpen, setDiscountEditorOpen] =
    useState(false);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();

    return customers.filter((customer) => {
      const matchesSearch =
        !query ||
        [
          customer.name,
          customer.email,
          customer.phone,
        ].some((value) =>
          value.toLowerCase().includes(query),
        );
      const matchesStatus =
        status === "all" ||
        (status === "verified"
          ? customer.verified
          : !customer.verified);

      return matchesSearch && matchesStatus;
    });
  }, [customers, search, status]);

  const selectedCustomer =
    customers.find(
      (customer) =>
        customer.id === selectedId,
    ) ?? null;
  const customersWithOrders =
    customers.filter(
      (customer) =>
        customer.orderCount > 0,
    ).length;
  const totalWalletBalance =
    customers.reduce(
      (total, customer) =>
        total + customer.walletBalance,
      0,
    );

  function selectCustomer(customerId: string) {
    setSelectedId(customerId);
    setDiscountEditorOpen(false);
  }

  function exportCustomers() {
    const headers = [
      "Full name",
      "Email",
      "Phone",
      "Status",
      "Wallet balance",
      "Orders",
      "Total spent",
      "Current country",
      "Previous country",
      "Registered",
      "Last sign-in",
    ];
    const rows = customers.map((customer) => [
      customer.name,
      customer.email,
      customer.phone,
      customer.verified
        ? "Verified"
        : "Unverified",
      customer.walletBalance,
      customer.orderCount,
      customer.totalSpent,
      customer.currentCountryCode ?? "",
      customer.previousCountryCode ?? "",
      customer.registeredAt,
      customer.lastSignInAt ?? "",
    ]);
    const csv = [headers, ...rows]
      .map((row) =>
        row.map(csvValue).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([csv], {
        type: "text/csv;charset=utf-8",
      }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = "ingamepin-customers.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
            Customer management
          </p>
          <h1 className="mt-2 text-3xl font-black">
            Registered Users
          </h1>
          <p className="mt-2 text-slate-500">
            View customer accounts,
            spending, wallet balances,
            login countries and discounts.
          </p>
        </div>
        <button
          type="button"
          onClick={exportCustomers}
          className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-bold text-slate-700 shadow-sm hover:border-blue-300 hover:text-blue-600"
        >
          Export CSV
        </button>
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-3">
        <SummaryCard
          label="Registered users"
          value={String(customers.length)}
          detail="Customer accounts"
        />
        <SummaryCard
          label="Customers with orders"
          value={String(
            customersWithOrders,
          )}
          detail="At least one order"
        />
        <SummaryCard
          label="Total wallet balance"
          value={formatMoney(
            totalWalletBalance,
          )}
          detail="Across customer wallets"
        />
      </div>

      <div className="mt-7 grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-[1fr_220px]">
        <label className="text-sm font-bold">
          Search customers
          <input
            type="search"
            value={search}
            onChange={(event) =>
              setSearch(event.target.value)
            }
            placeholder="Name, email or mobile number"
            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-500"
          />
        </label>
        <label className="text-sm font-bold">
          Account status
          <select
            value={status}
            onChange={(event) =>
              setStatus(
                event.target.value as
                  | "all"
                  | "verified"
                  | "unverified",
              )
            }
            className="mt-2 w-full rounded-xl border border-slate-200 px-4 py-3 font-normal outline-none focus:border-blue-500"
          >
            <option value="all">
              All users
            </option>
            <option value="verified">
              Verified
            </option>
            <option value="unverified">
              Unverified
            </option>
          </select>
        </label>
      </div>

      <div className="mt-5 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full min-w-[1080px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-4">
                Customer
              </th>
              <th className="px-4 py-4">
                Mobile
              </th>
              <th className="px-4 py-4">
                Status
              </th>
              <th className="px-4 py-4 text-right">
                Wallet
              </th>
              <th className="px-4 py-4 text-right">
                Orders
              </th>
              <th className="px-4 py-4 text-right">
                Spent
              </th>
              <th className="px-4 py-4">
                Country
              </th>
              <th className="px-4 py-4">
                Joined
              </th>
              <th className="px-4 py-4" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredCustomers.map(
              (customer) => (
                <tr
                  key={customer.id}
                  className="hover:bg-slate-50"
                >
                  <td className="px-4 py-4">
                    <p className="font-bold text-slate-900">
                      {customer.name}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {customer.email}
                    </p>
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    {customer.phone || "—"}
                  </td>
                  <td className="px-4 py-4">
                    <VerificationBadge
                      verified={
                        customer.verified
                      }
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-right font-bold">
                    {formatMoney(
                      customer.walletBalance,
                      customer.walletCurrency,
                    )}
                  </td>
                  <td className="px-4 py-4 text-right">
                    {customer.orderCount}
                  </td>
                  <td className="whitespace-nowrap px-4 py-4 text-right font-bold">
                    {formatMoney(
                      customer.totalSpent,
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <CountryCode
                      value={
                        customer.currentCountryCode
                      }
                    />
                  </td>
                  <td className="whitespace-nowrap px-4 py-4">
                    {formatDate(
                      customer.registeredAt,
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <button
                      type="button"
                      onClick={() =>
                        selectCustomer(
                          customer.id,
                        )
                      }
                      className="rounded-lg border border-slate-200 px-3 py-2 font-bold text-blue-600 hover:bg-blue-50"
                    >
                      View
                    </button>
                  </td>
                </tr>
              ),
            )}
          </tbody>
        </table>
        {filteredCustomers.length === 0 && (
          <p className="p-8 text-center text-slate-500">
            No registered customer matches
            this search.
          </p>
        )}
      </div>

      {selectedCustomer && (
        <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
          <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-600">
                Customer details
              </p>
              <h2 className="mt-2 text-2xl font-black">
                {selectedCustomer.name}
              </h2>
              <p className="mt-1 text-slate-500">
                {selectedCustomer.email}
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setSelectedId(null);
                setDiscountEditorOpen(false);
              }}
              className="self-start rounded-lg px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100"
            >
              Close
            </button>
          </div>

          <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <Detail
              label="Mobile"
              value={
                selectedCustomer.phone || "—"
              }
            />
            <Detail
              label="Email status"
              content={
                <VerificationBadge
                  verified={
                    selectedCustomer.verified
                  }
                />
              }
            />
            <Detail
              label="Wallet balance"
              value={formatMoney(
                selectedCustomer.walletBalance,
                selectedCustomer.walletCurrency,
              )}
            />
            <Detail
              label="Registered"
              value={formatDate(
                selectedCustomer.registeredAt,
              )}
            />
            <Detail
              label="Last sign-in"
              value={formatDate(
                selectedCustomer.lastSignInAt,
              )}
            />
            <Detail
              label="Order history"
              value={`${selectedCustomer.orderCount} orders · ${formatMoney(
                selectedCustomer.totalSpent,
              )}`}
            />
            <Detail
              label="Current login country"
              content={
                <CountryCode
                  value={
                    selectedCustomer.currentCountryCode
                  }
                />
              }
            />
            <Detail
              label="Previous login country"
              content={
                <CountryCode
                  value={
                    selectedCustomer.previousCountryCode
                  }
                />
              }
            />
            <Detail
              label="Country updated"
              value={formatDate(
                selectedCustomer.currentCountryAt,
              )}
            />
            <Detail
              label="Customer discount"
              value={
                selectedCustomer
                  .productDiscounts.length > 0
                  ? `${selectedCustomer.productDiscounts.length} active product ${
                      selectedCustomer
                        .productDiscounts
                        .length === 1
                        ? "discount"
                        : "discounts"
                    }`
                  : "No active discount"
              }
            />
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() =>
                setDiscountEditorOpen(
                  (open) => !open,
                )
              }
              className="rounded-xl bg-blue-600 px-5 py-3 font-bold text-white hover:bg-blue-500"
            >
              Manage discount
            </button>
            <a
              href={`/admin/orders?email=${encodeURIComponent(
                selectedCustomer.email,
              )}`}
              className="rounded-xl border border-slate-200 px-5 py-3 font-bold text-slate-700 hover:bg-slate-50"
            >
              View customer orders
            </a>
            <a
              href="/admin/wallet"
              className="rounded-xl border border-slate-200 px-5 py-3 font-bold text-slate-700 hover:bg-slate-50"
            >
              View wallet activity
            </a>
          </div>

          {discountEditorOpen && (
            <DiscountEditor
              key={selectedCustomer.id}
              customer={selectedCustomer}
              products={products}
              onCancel={() =>
                setDiscountEditorOpen(false)
              }
            />
          )}
        </section>
      )}
    </>
  );
}

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-sm text-slate-500">
        {label}
      </p>
      <p className="mt-2 text-3xl font-black">
        {value}
      </p>
      <p className="mt-1 text-xs text-slate-400">
        {detail}
      </p>
    </div>
  );
}

function VerificationBadge({
  verified,
}: {
  verified: boolean;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold ${
        verified
          ? "bg-sky-100 text-sky-700"
          : "bg-red-100 text-red-700"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          verified
            ? "bg-sky-500"
            : "bg-red-500"
        }`}
      />
      {verified
        ? "Verified"
        : "Unverified"}
    </span>
  );
}

function CountryCode({
  value,
}: {
  value: string | null;
}) {
  return value ? (
    <span className="inline-flex min-w-9 justify-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
      {value}
    </span>
  ) : (
    <span className="text-slate-400">
      —
    </span>
  );
}

function Detail({
  label,
  value,
  content,
}: {
  label: string;
  value?: string;
  content?: ReactNode;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <div className="mt-1 font-bold text-slate-800">
        {content ?? value}
      </div>
    </div>
  );
}

function DiscountEditor({
  customer,
  products,
  onCancel,
}: {
  customer: AdminCustomer;
  products: CustomerProduct[];
  onCancel: () => void;
}) {
  const existingDiscounts = new Map(
    customer.productDiscounts.map(
      (discount) => [
        discount.productId,
        discount.discountPercent,
      ],
    ),
  );
  const [enabledProductIds, setEnabledProductIds] =
    useState(
      () =>
        new Set(
          customer.productDiscounts.map(
            (discount) =>
              discount.productId,
          ),
        ),
    );

  function setProductEnabled(
    productId: string,
    enabled: boolean,
  ) {
    setEnabledProductIds((current) => {
      const next = new Set(current);

      if (enabled) {
        next.add(productId);
      } else {
        next.delete(productId);
      }

      return next;
    });
  }

  return (
    <form
      action={saveCustomerDiscount}
      className="mt-6 border-t border-slate-200 pt-6"
    >
      <input
        type="hidden"
        name="customer_id"
        value={customer.id}
      />
      <h3 className="text-xl font-black">
        Product discounts
      </h3>
      <p className="mt-1 text-sm text-slate-500">
        Enable products and set a separate
        discount percentage for each one.
      </p>
      <div className="mt-5 divide-y divide-slate-200 border-y border-slate-200">
        {products.map((product) => {
          const enabled =
            enabledProductIds.has(
              product.id,
            );

          return (
            <div
              key={product.id}
              className={`grid gap-4 py-4 sm:grid-cols-[1fr_150px_120px] sm:items-center ${
                enabled
                  ? ""
                  : "opacity-60"
              }`}
            >
              <div>
                <p className="font-bold">
                  {product.name}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  {product.productType.replaceAll(
                    "_",
                    " ",
                  )}
                </p>
              </div>
              <label className="text-sm font-bold">
                Discount
                <span className="relative mt-2 block">
                  <input
                    name={`discount_percent_${product.id}`}
                    type="number"
                    min="0.01"
                    max="100"
                    step="0.01"
                    required={enabled}
                    disabled={!enabled}
                    defaultValue={
                      existingDiscounts.get(
                        product.id,
                      ) ?? 1
                    }
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 pr-9 font-normal disabled:bg-slate-100"
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                    %
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-3 text-sm font-bold">
                <input
                  type="checkbox"
                  name="product_ids"
                  value={product.id}
                  checked={enabled}
                  onChange={(event) =>
                    setProductEnabled(
                      product.id,
                      event.target.checked,
                    )
                  }
                  className="h-4 w-4"
                />
                {enabled
                  ? "Enabled"
                  : "Disabled"}
              </label>
            </div>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button
          type="submit"
          className="rounded-xl bg-blue-600 px-6 py-3 font-bold text-white hover:bg-blue-500"
        >
          Save discount
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-xl px-6 py-3 font-bold text-slate-500 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
