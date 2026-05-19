import type { Listing } from '@iskotify/utils'

const STATUS_STYLES: Record<string, { badge: string; label: string }> = {
  active:   { badge: 'bg-green-100 text-green-700',   label: 'Active' },
  upcoming: { badge: 'bg-amber-100 text-amber-700',   label: 'Upcoming' },
  closed:   { badge: 'bg-gray-100 text-gray-500',     label: 'Closed' },
}

const TYPE_STYLES: Record<string, { badge: string; label: string; accent: string; iconBg: string; icon: string }> = {
  scholarship: { badge: 'bg-[#fef2f2] text-[#800000]', label: 'Scholarship', accent: 'bg-[#800000]', iconBg: 'bg-[#800000]/10', icon: '🎓' },
  exam:        { badge: 'bg-[#eff6ff] text-[#1e3a8a]', label: 'Exam',        accent: 'bg-[#1e3a8a]', iconBg: 'bg-[#1e3a8a]/10', icon: '📝' },
}

function formatDeadline(listing: Listing): string {
  if (listing.type === 'exam' && listing.exam_date) {
    return `Exam: ${new Date(listing.exam_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  if (listing.deadline) {
    return `Deadline: ${new Date(listing.deadline).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' })}`
  }
  return 'Opens soon'
}

function formatAmount(listing: Listing): string {
  if (listing.grant_amount) return `₱${listing.grant_amount.toLocaleString()}/mo`
  if (listing.coverage) return listing.coverage.split('.')[0] ?? listing.coverage
  return listing.type === 'exam' ? 'Entrance Exam' : 'See details'
}

export function ListingCard({ listing }: { listing: Listing }) {
  const type = TYPE_STYLES[listing.type] ?? TYPE_STYLES.scholarship!
  const status = STATUS_STYLES[listing.status] ?? STATUS_STYLES.active!
  const isClosed = listing.status === 'closed'

  return (
    <div className="group bg-white rounded-[20px] border border-black/[0.07] overflow-hidden shadow-[0_2px_16px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.10)] hover:-translate-y-0.5 transition-all duration-200 flex flex-col">

      {/* Top accent + icon row */}
      <div className="px-5 pt-5 pb-4 flex items-start gap-3">
        <div className={`flex-shrink-0 w-10 h-10 rounded-[12px] ${type.iconBg} flex items-center justify-center text-lg`}>
          {type.icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${type.badge}`}>
              {type.label}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status.badge}`}>
              {status.label}
            </span>
          </div>
          <h3 className="font-heading font-bold text-[13.5px] text-[#1d1d1f] leading-snug line-clamp-2">
            {listing.title}
          </h3>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-black/[0.05]" />

      {/* Details */}
      <div className="px-5 py-4 flex-1 flex flex-col gap-2">
        <p className="text-[11.5px] text-[#6e6e73] font-body">{listing.provider}</p>
        <div className="flex items-center gap-1.5">
          <span className="text-[11.5px] font-semibold text-[#1d1d1f] font-body">{formatAmount(listing)}</span>
          {listing.region && (
            <>
              <span className="text-[#d2d2d7]">·</span>
              <span className="text-[11px] text-[#6e6e73] font-body truncate">{listing.region}</span>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 pb-5 flex items-center justify-between gap-2">
        <span className={`text-[11px] font-semibold font-body ${isClosed ? 'text-[#6e6e73]' : 'text-[#800000]'}`}>
          {formatDeadline(listing)}
        </span>
        {!isClosed && (
          <a
            href={listing.external_url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-shrink-0 bg-[#800000] text-white rounded-[10px] px-3 py-1.5 text-[11px] font-semibold font-body hover:bg-[#a00000] transition-colors"
          >
            Apply →
          </a>
        )}
      </div>
    </div>
  )
}
