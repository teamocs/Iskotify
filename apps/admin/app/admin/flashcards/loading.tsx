export default function FlashcardsLoading() {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="h-[52px] bg-white border-b border-black/[0.08] flex items-center px-4 flex-shrink-0">
        <div className="h-5 w-40 bg-[#e5e7eb] rounded-[10px] animate-pulse" />
      </div>
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
        <div className="h-8 w-48 bg-[#e5e7eb] rounded animate-pulse" />
        <div className="bg-white border border-[#e5e7eb] rounded-2xl overflow-hidden">
          <div className="h-10 bg-[#f9fafb] border-b border-[#f3f4f6]" />
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-12 border-b border-[#f3f4f6] px-5 flex items-center last:border-0">
              <div className="h-4 bg-[#e5e7eb] rounded animate-pulse w-3/4" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
