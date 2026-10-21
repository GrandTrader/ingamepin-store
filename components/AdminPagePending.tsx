export default function AdminPagePending() {
  return (
    <div role="status" aria-label="Opening admin page" className="px-5 py-4">
      <span className="sr-only">Opening admin page…</span>
      <div aria-hidden="true" className="h-1 w-24 animate-pulse rounded-full bg-blue-200 motion-reduce:animate-none" />
    </div>
  );
}
