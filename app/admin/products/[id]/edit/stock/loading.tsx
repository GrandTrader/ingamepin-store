export default function LoadingStock() {
  return <div role="status" aria-live="polite" className="mx-auto w-full max-w-[1500px] p-5 text-slate-700 sm:p-8">
    <p className="font-bold">Loading stock…</p>
    <p className="mt-2 text-sm">Preparing denominations and stock controls.</p>
  </div>;
}
