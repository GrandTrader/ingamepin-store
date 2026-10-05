import { getProductPaypalychRestriction } from "@/lib/paypalych-product-policy-server";
import PaypalychProductWarning from "./PaypalychProductWarning";
import Link from "@/components/ProductEditorLink";

const tabs = [
  ["general", "General"],
  ["gallery", "Gallery"],
  ["delivery", "Delivery"],
  ["product-options", "Product options"],
  ["discounted-customers", "Discounted customers"],
  ["stock", "Stock"],
  ["digiseller", "DigiSeller"],
  ["supplier", "Supplier"],
  ["customer-information", "Customer information"],
  ["sold-products", "Sold products"],
  ["visibility", "Visibility"],
  ["restrictions", "Restrictions"],
  ["affiliate", "Affiliate"],
] as const;

export default async function ProductEditPageTabs({
  productId,
  current,
}: {
  productId: string;
  current: string;
}) {
  const blockedBrand = await getProductPaypalychRestriction(productId);
  return (
    <>
    <nav data-product-edit-tabs aria-label="Product settings tabs" className="overflow-x-auto border border-slate-300 bg-slate-100 p-1 shadow-sm">
      <div className="flex min-w-max gap-px">
        {tabs.map(([id, label]) => (
          <Link
            key={id}
            href={`/admin/products/${productId}/edit/${id}`}
            scroll={false}
            warm={id === "supplier" || id === "digiseller" || id === "stock" ? "intent" : "visible"}
            aria-current={current === id ? "page" : undefined}
            className={`border border-slate-300 px-4 py-3 text-sm font-bold transition ${
              current === id
                ? "border-blue-600 bg-blue-600 text-white"
                : "bg-white text-slate-600 hover:bg-blue-50 hover:text-blue-600"
            }`}
          >
            {label}
          </Link>
        ))}
      </div>
    </nav>
    <PaypalychProductWarning brand={blockedBrand} />
    </>
  );
}
