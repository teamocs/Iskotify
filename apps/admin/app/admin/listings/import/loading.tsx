export default function ListingImportLoading() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden" aria-busy="true">
      <div className="h-[52px] bg-surface border-b border-subtle flex items-center px-4 flex-shrink-0">
        <div className="h-5 w-40 bg-neutral-soft rounded-sm animate-pulse" />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 md:px-6 md:py-5 space-y-4">
        <div className="h-40 bg-surface border border-subtle rounded-md animate-pulse" />
        <div className="h-64 bg-surface border border-subtle rounded-md animate-pulse" />
      </div>
      <p role="status" className="sr-only">Loading import…</p>
    </div>
  )
}
