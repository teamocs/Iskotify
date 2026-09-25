export default function ListingsLoading() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden" aria-busy="true">
      <div className="h-[52px] bg-surface border-b border-subtle flex items-center px-4 flex-shrink-0">
        <div className="h-5 w-40 bg-neutral-soft rounded-sm animate-pulse" />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 md:px-6 md:py-5 space-y-4">
        <div className="h-12 bg-surface border border-subtle rounded-md animate-pulse" />
        <div className="bg-surface border border-subtle rounded-md overflow-hidden">
          <div className="h-14 border-b border-subtle" />
          <div className="h-9 bg-surface-3 border-b border-subtle" />
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-11 border-b border-subtle px-3 flex items-center last:border-0">
              <div className="h-3.5 bg-neutral-soft rounded animate-pulse w-3/4" />
            </div>
          ))}
        </div>
      </div>
      <p role="status" className="sr-only">Loading listings…</p>
    </div>
  )
}
