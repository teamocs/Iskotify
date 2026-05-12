import type { Listing } from '@iskotify/utils'

const COVER_COLORS: Record<string, string> = {
  scholarship: 'from-[#800000] to-[#a00000]',
  exam: 'from-[#1e3a8a] to-[#1d4ed8]'
}

const STATUS_STYLES: Record<string, { badge: string; cta: string }> = {
  active:   { badge: 'bg-green-100 text-green-800',  cta: 'Apply →' },
  upcoming: { badge: 'bg-amber-100 text-amber-800',  cta: 'Notify →' },
  closed:   { badge: 'bg-gray-100 text-gray-500',    cta: 'View →' }
}

const TYPE_STYLES: Record<string, string> = {
  scholarship: 'bg-[#fef2f2] text-[#800000]',
  exam:        'bg-[#eff6ff] text-[#1e3a8a]'
}

function formatDeadline(listing: Listing) {
  if (listing.type === 'exam' && listing.exam_date) {
    return `Exam: ${new Date(listing.exam_date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`
  }
  if (listing.deadline) {
    return `Deadline: ${new Date(listing.deadline).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}`
  }
  return 'Opens soon'
}

function formatAmount(listing: Listing) {
  if (listing.grant_amount) return `₱${listing.grant_amount.toLocaleString()}/mo`
  if (listing.coverage) return listing.coverage.split('.')[0]
  return listing.type === 'exam' ? 'Free' : 'See details'
}

export function ListingCard({ listing }: { listing: Listing }) {
  const cover = COVER_COLORS[listing.type] ?? COVER_COLORS.scholarship
  const statusStyle = STATUS_STYLES[listing.status] ?? STATUS_STYLES.active!
  const statusBadge = statusStyle.badge
  const cta = statusStyle.cta
  const typeBadge = TYPE_STYLES[listing.type] ?? TYPE_STYLES.scholarship

  return (
    <div className="bg-white rounded-[22px] border border-black/[0.06] overflow-hidden shadow-[0_8px_32px_rgba(0,0,0,0.06)] hover:shadow-[0_12px_40px_rgba(0,0,0,0.1)] hover:-translate-y-1 transition-all duration-200">
      <div className={`bg-gradient-to-br ${cover} h-20 flex items-center justify-center`}>
        <span className="text-3xl">{listing.type === 'exam' ? '📝' : '🎓'}</span>
      </div>
      <div className="p-4">
        <div className="flex gap-1.5 mb-2">
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${typeBadge}`}>
            {listing.type}
          </span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusBadge}`}>
            {listing.status}
          </span>
        </div>
        <h3 className="font-heading font-bold text-[13px] text-[#1d1d1f] mb-0.5 leading-snug">{listing.title}</h3>
        <p className="text-[11px] text-[#6e6e73] mb-1.5">{listing.provider}</p>
        <p className="text-[11px] text-[#374151] mb-3">
          {formatAmount(listing)} · {listing.region || 'Nationwide'}
        </p>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-[#800000] font-semibold">{formatDeadline(listing)}</span>
          <a
            href={listing.external_url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-[#800000] text-white rounded-lg px-3 py-1 text-[11px] font-semibold hover:bg-[#a00000] transition-colors"
          >
            {cta}
          </a>
        </div>
      </div>
    </div>
  )
}
