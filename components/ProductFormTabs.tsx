const tabs = [
  ["general", "General"],
  ["pricing", "Pricing"],
  ["stock", "Stock"],
  ["delivery", "Delivery"],
  ["customer-information", "Customer information"],
  ["preview", "Preview"],
] as const;

export default function ProductFormTabs() {
  return (
    <nav className="sticky top-0 z-20 overflow-x-auto rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
      <div className="flex min-w-max">
        {tabs.map(([id, label]) => (
          <a
            key={id}
            href={"#" + id}
            className="rounded-lg px-4 py-3 text-sm font-bold text-slate-600 transition hover:bg-blue-50 hover:text-blue-600"
          >
            {label}
          </a>
        ))}
      </div>
    </nav>
  );
}
