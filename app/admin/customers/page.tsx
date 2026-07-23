import { redirect } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import AdminSidebar from "../AdminSidebar";
import CustomersPanel, {
  type AdminCustomer,
  type CustomerProduct,
} from "./CustomersPanel";

export const dynamic = "force-dynamic";

type WalletRow = {
  user_id: string;
  balance: number | string;
  currency: string;
};

type OrderRow = {
  customer_email: string;
  total: number | string;
  status: string;
};

type DiscountRow = {
  user_id: string;
  product_id: string;
  discount_percent: number | string;
};

type LoginActivityRow = {
  user_id: string;
  current_country_code: string | null;
  previous_country_code: string | null;
  current_login_at: string | null;
};

async function loadAllAuthUsers() {
  const admin = createAdminClient();
  const users = [];
  const perPage = 1000;
  let page = 1;

  while (true) {
    const result =
      await admin.auth.admin.listUsers({
        page,
        perPage,
      });

    if (result.error) {
      throw new Error(
        `Unable to load registered users: ${result.error.message}`,
      );
    }

    users.push(...result.data.users);

    if (
      result.data.users.length < perPage
    ) {
      break;
    }

    page += 1;
  }

  return users;
}

async function loadAllOrders() {
  const admin = createAdminClient();
  const rows: OrderRow[] = [];
  const pageSize = 1000;
  let from = 0;

  while (true) {
    const result = await admin
      .from("orders")
      .select(
        "customer_email, total, status",
      )
      .range(
        from,
        from + pageSize - 1,
      );

    if (result.error) {
      throw new Error(
        `Unable to load customer orders: ${result.error.message}`,
      );
    }

    const page = (result.data ??
      []) as OrderRow[];
    rows.push(...page);

    if (page.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  return rows;
}

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{
    selected?: string;
    success?: string;
    error?: string;
  }>;
}) {
  const { selected, success, error } =
    await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const adminCheck = await supabase
    .from("admin_users")
    .select("user_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!adminCheck.data) {
    redirect(
      "/admin/login?error=Access denied",
    );
  }

  const admin = createAdminClient();
  const [
    users,
    adminUsersResult,
    walletsResult,
    orders,
    discountsResult,
    productsResult,
    loginActivityResult,
  ] = await Promise.all([
    loadAllAuthUsers(),
    admin
      .from("admin_users")
      .select("user_id"),
    admin
      .from("customer_wallets")
      .select("user_id, balance, currency"),
    loadAllOrders(),
    admin
      .from("customer_product_discounts")
      .select(
        "user_id, product_id, discount_percent",
      )
      .eq("is_active", true),
    admin
      .from("products")
      .select(
        "id, name, product_type",
      )
      .eq("status", "ACTIVE")
      .order("name", {
        ascending: true,
      }),
    admin
      .from("customer_login_activity")
      .select(
        "user_id, current_country_code, previous_country_code, current_login_at",
      ),
  ]);

  const databaseError =
    adminUsersResult.error ??
    walletsResult.error ??
    discountsResult.error ??
    productsResult.error ??
    loginActivityResult.error;

  if (databaseError) {
    throw new Error(
      `Unable to load customer details: ${databaseError.message}`,
    );
  }

  const adminUserIds = new Set(
    (adminUsersResult.data ?? []).map(
      (entry) => entry.user_id,
    ),
  );
  const wallets = new Map(
    (
      (walletsResult.data ??
        []) as WalletRow[]
    ).map((wallet) => [
      wallet.user_id,
      wallet,
    ]),
  );
  const loginActivity = new Map(
    (
      (loginActivityResult.data ??
        []) as LoginActivityRow[]
    ).map((activity) => [
      activity.user_id,
      activity,
    ]),
  );
  const discountsByUser = new Map<
    string,
    DiscountRow[]
  >();

  for (const discount of (discountsResult.data ??
    []) as DiscountRow[]) {
    const rows =
      discountsByUser.get(
        discount.user_id,
      ) ?? [];
    rows.push(discount);
    discountsByUser.set(
      discount.user_id,
      rows,
    );
  }

  const ordersByEmail = new Map<
    string,
    {
      count: number;
      totalSpent: number;
    }
  >();

  for (const order of orders) {
    const email = order.customer_email
      .trim()
      .toLowerCase();
    const summary =
      ordersByEmail.get(email) ?? {
        count: 0,
        totalSpent: 0,
      };
    summary.count += 1;

    if (
      order.status === "PAID" ||
      order.status === "PROCESSING" ||
      order.status === "DELIVERED"
    ) {
      summary.totalSpent += Number(
        order.total,
      );
    }

    ordersByEmail.set(email, summary);
  }

  const customers: AdminCustomer[] =
    users
      .filter(
        (customer) =>
          !adminUserIds.has(customer.id),
      )
      .map((customer) => {
        const email =
          customer.email?.toLowerCase() ??
          "";
        const wallet = wallets.get(
          customer.id,
        );
        const orderSummary =
          ordersByEmail.get(email);
        const customerDiscounts =
          discountsByUser.get(
            customer.id,
          ) ?? [];
        const activity =
          loginActivity.get(
            customer.id,
          );
        const fullName = String(
          customer.user_metadata
            ?.full_name ?? "",
        ).trim();

        return {
          id: customer.id,
          name:
            fullName ||
            email.split("@")[0] ||
            "Customer",
          email,
          phone: String(
            customer.user_metadata
              ?.phone ?? "",
          ).trim(),
          verified: Boolean(
            customer.email_confirmed_at,
          ),
          walletBalance: Number(
            wallet?.balance ?? 0,
          ),
          walletCurrency:
            wallet?.currency ?? "USD",
          orderCount:
            orderSummary?.count ?? 0,
          totalSpent:
            orderSummary?.totalSpent ??
            0,
          registeredAt:
            customer.created_at,
          lastSignInAt:
            customer.last_sign_in_at ??
            null,
          currentCountryCode:
            activity?.current_country_code ??
            null,
          previousCountryCode:
            activity?.previous_country_code ??
            null,
          currentCountryAt:
            activity?.current_login_at ??
            null,
          productDiscounts:
            customerDiscounts.map(
              (discount) => ({
                productId:
                  discount.product_id,
                discountPercent: Number(
                  discount.discount_percent,
                ),
              }),
            ),
        };
      })
      .sort(
        (first, second) =>
          new Date(
            second.registeredAt,
          ).getTime() -
          new Date(
            first.registeredAt,
          ).getTime(),
      );

  const products: CustomerProduct[] = (
    productsResult.data ?? []
  ).map((product) => ({
    id: product.id,
    name: product.name,
    productType: product.product_type,
  }));

  return (
    <main className="min-h-screen bg-slate-100 text-slate-900 md:flex">
      <AdminSidebar />
      <section className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-7xl">
          {success && (
            <p className="mb-5 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-medium text-emerald-700">
              {success}
            </p>
          )}
          {error && (
            <p className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm font-medium text-red-700">
              {error}
            </p>
          )}
          <CustomersPanel
            customers={customers}
            products={products}
            initialSelectedId={selected}
          />
        </div>
      </section>
    </main>
  );
}
