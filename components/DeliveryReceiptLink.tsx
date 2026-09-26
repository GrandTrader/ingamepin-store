export default function DeliveryReceiptLink({ url }: { url?: string }) {
  if (!url) return null;
  return <a href={url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm font-bold text-emerald-800 hover:bg-emerald-100">View delivery receipt ↗</a>;
}
