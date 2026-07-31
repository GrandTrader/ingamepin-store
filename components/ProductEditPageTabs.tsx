import Link from "next/link";

const tabs = [
  ["general", "General"],
  ["delivery", "Delivery"],
  ["product-options", "Product options"],
  ["stock", "Stock"],
  ["customer-information", "Customer information"],
  ["sold-products", "Sold products"],
  ["visibility", "Visibility"],
] as const;

export default function ProductEditPageTabs({
  productId,
  current,
}: {
  productId: string;
  current: string;
}) {
  return (
    <nav className="overflow-x-auto border border-slate-300 bg-slate-100 p-1 shadow-sm">
      <div className="flex min-w-max gap-px">
        {tabs.map(([id, label]) => (
          <Link
            key={id}
            href={`/admin/products/${productId}/edit/${id}`}
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
  );
}
