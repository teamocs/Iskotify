export default function FlashcardsLoading() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden" aria-busy="true">
      <div className="h-[52px] bg-surface border-b border-subtle flex items-center px-4 md:px-6 flex-shrink-0">
        <div className="h-5 w-40 bg-neutral-soft rounded-sm animate-pulse" />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 md:px-6 md:py-5 space-y-4">
        <div className="h-4 w-80 max-w-full bg-neutral-soft rounded-sm animate-pulse" />
        <div className="h-8 w-64 bg-neutral-soft rounded-pill animate-pulse" />
        <div className="bg-surface border border-subtle rounded-md overflow-hidden">
          <div className="h-12 border-b border-subtle" />
          <div className="h-9 bg-surface-3 border-b border-subtle" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 border-b border-subtle px-4 flex items-center last:border-0">
              <div className="h-4 bg-neutral-soft rounded-sm animate-pulse w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
