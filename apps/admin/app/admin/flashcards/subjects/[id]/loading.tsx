export default function SubjectLoading() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-[52px] bg-white border-b border-black/[0.08] flex items-center px-4 flex-shrink-0">
        <div className="h-5 w-40 bg-[#e5e7eb] rounded-[10px] animate-pulse" />
      </div>
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
        <div className="h-5 w-56 bg-[#e5e7eb] rounded animate-pulse" />
        {[...Array(3)].map((_, i) => (
          <div key={i} className="h-12 bg-white border border-[#e5e7eb] rounded-[16px] animate-pulse" />
        ))}
      </div>
    </div>
  )
}
