export default function AdminLoading() {
  return <div role="status" aria-live="polite" className="mx-auto w-full max-w-[1500px] p-5 sm:p-8">
    <p className="font-bold text-blue-600">Loading admin page…</p>
    <div aria-hidden="true" className="mt-6 space-y-4 motion-safe:animate-pulse">
      <div className="h-10 w-2/3 rounded-xl bg-slate-100" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">{[0,1,2,3].map(index => <div key={index} className="h-24 rounded-xl bg-slate-100" />)}</div>
      <div className="h-72 rounded-2xl bg-slate-100" />
    </div>
  </div>;
}
