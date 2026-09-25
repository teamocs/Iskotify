export default function SubjectLoading() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden" aria-busy="true">
      <div className="h-[52px] bg-surface border-b border-subtle flex items-center px-4 md:px-6 flex-shrink-0">
        <div className="h-5 w-40 bg-neutral-soft rounded-sm animate-pulse" />
      </div>
      <div className="flex-1 overflow-y-auto px-3 py-4 sm:px-4 md:px-6 md:py-5 space-y-4">
        <div className="h-5 w-56 bg-neutral-soft rounded-sm animate-pulse" />
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 bg-surface border border-subtle rounded-md px-4 flex items-center">
              <div className="h-4 w-1/3 bg-neutral-soft rounded-sm animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
