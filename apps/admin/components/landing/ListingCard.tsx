import { Award, Pencil } from './Icons'
import type { Listing } from '@iskotify/utils'

const STATUS_STYLES: Record<string, { badge: string; label: string }> = {
  active:   { badge: 'bg-success-soft text-success-strong',   label: 'Active' },
  upcoming: { badge: 'bg-warning-soft text-warning-strong',   label: 'Upcoming' },
  closed:   { badge: 'bg-ink-subtle/10 text-ink-muted',     label: 'Closed' },
}

const TYPE_STYLES: Record<string, { badge: string; label: string; accent: string; iconBg: string; icon: 'scholarship' | 'exam' }> = {
  scholarship: { badge: 'bg-maroon-dim text-maroon', label: 'Scholarship', accent: 'bg-maroon', iconBg: 'bg-maroon/10', icon: 'scholarship' },
  exam:        { badge: 'bg-info-soft text-info-strong', label: 'Exam',        accent: 'bg-info', iconBg: 'bg-info-soft', icon: 'exam' },
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
    <div className="group bg-white rounded-[20px] border border-black/[0.07] overflow-hidden shadow-[0_2px_16px_rgba(0,0,0,0.05)] hover:shadow-[0_8px_32px_rgba(0,0,0,0.10)] hover:-translate-y-0.5 transition-[box-shadow,transform] duration-200 flex flex-col">

      {/* Top accent + icon row */}
      <div className="px-5 pt-5 pb-4 flex items-start gap-3">
        <div className={`flex-shrink-0 w-10 h-10 rounded-sm ${type.iconBg} flex items-center justify-center ${type.icon === 'exam' ? 'text-info-strong' : 'text-maroon'}`}>
          {type.icon === 'exam' ? <Pencil className="size-5" /> : <Award className="size-5" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap gap-1.5 mb-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${type.badge}`}>
              {type.label}
            </span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${status.badge}`}>
              {status.label}
            </span>
          </div>
          <h3 className="font-heading font-bold text-base text-ink leading-snug line-clamp-2">
            {listing.title}
          </h3>
        </div>
      </div>

      {/* Divider */}
      <div className="mx-5 h-px bg-neutral-soft" />

      {/* Details */}
      <div className="px-5 py-4 flex-1 flex flex-col gap-2">
        <p className="text-sm text-ink-muted font-body">{listing.provider}</p>
        <div className="flex items-center gap-1.5">
          <span className="text-sm font-semibold text-ink font-body">{formatAmount(listing)}</span>
          {listing.region && (
            <>
              <span className="text-ink-subtle">·</span>
              <span className="text-sm text-ink-muted font-body truncate">{listing.region}</span>
            </>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-5 pb-5 flex items-center justify-between gap-2">
        <span className={`text-sm font-semibold font-body ${isClosed ? 'text-ink-muted' : 'text-maroon'}`}>
          {formatDeadline(listing)}
        </span>
        {!isClosed && (
          <a
            href={listing.external_url || '#'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-11 flex-shrink-0 items-center bg-maroon text-ink-inverse rounded-sm px-4 text-sm font-semibold font-body hover:bg-maroon-hover transition-colors"
          >
            Apply<span className="sr-only"> to {listing.title} (opens in a new tab)</span>
          </a>
        )}
      </div>
    </div>
  )
}
