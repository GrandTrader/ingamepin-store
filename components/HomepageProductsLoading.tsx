export default function HomepageProductsLoading() {
  return <div data-homepage-products-loading="desktop" className="space-y-4" aria-busy="true" aria-label="Loading products">
    {["Popular", "Newly Added Products"].map(title => <section key={title} className="rounded-[22px] bg-white p-4 shadow-sm sm:p-6">
      <h2 className="mb-4 text-xl font-extrabold sm:text-2xl">{title}</h2>
      <div aria-hidden="true" className="flex gap-3 overflow-hidden">
        {Array.from({length:6}, (_, i) => <div key={i} className="h-[365px] w-[195px] shrink-0 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <div className="mb-5 aspect-square rounded-lg bg-slate-200"/><div className="mb-3 h-4 w-full rounded bg-slate-200"/><div className="mb-8 h-4 w-3/4 rounded bg-slate-200"/><div className="h-8 w-1/2 rounded bg-slate-200"/>
        </div>)}
      </div>
    </section>)}
  </div>;
}
