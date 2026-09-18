export default function PageLoading() {
  return <div role="status" aria-live="polite" className="mx-auto w-full max-w-7xl px-4 py-6 text-slate-600">
    <p className="text-sm font-semibold">Loading…</p>
    <div aria-hidden="true" className="mt-4 space-y-3 motion-safe:animate-pulse">
      <div className="h-8 w-1/3 rounded-lg bg-slate-200" />
      <div className="h-24 rounded-xl bg-slate-100" />
      <div className="h-24 rounded-xl bg-slate-100" />
    </div>
  </div>;
}
