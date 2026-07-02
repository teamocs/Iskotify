import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { DateContributionActions } from '@/components/admin/DateContributionActions'

export const dynamic = 'force-dynamic'

interface Contribution {
  id: string
  listing_slug: string
  field: string
  suggested_date: string | null
  note: string | null
  source_url: string | null
  status: string
  created_at: string | null
}

const FIELD_LABELS: Record<string, string> = {
  exam_date: 'Exam date',
  deadline: 'Deadline',
  results_date: 'Results date',
}

async function getData(): Promise<{ rows: Contribution[]; titles: Record<string, string> }> {
  const db = createServerClient()

  const { data } = await db
    .from('listing_date_contributions')
    .select('id,listing_slug,field,suggested_date,note,source_url,status,created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .order('id')

  const rows = (data ?? []) as Contribution[]

  const titles: Record<string, string> = {}
  const slugs = Array.from(new Set(rows.map((r) => r.listing_slug).filter(Boolean)))
  if (slugs.length > 0) {
    const { data: listingData } = await db.from('listings').select('slug,title').in('slug', slugs)
    for (const l of (listingData ?? []) as { slug: string; title: string | null }[]) {
      if (l.slug && l.title) titles[l.slug] = l.title
    }
  }

  return { rows, titles }
}

function fmtDate(value: string | null): string {
  if (!value) return '—'
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return value
  return d.toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })
}

export default async function DateContributionsPage() {
  const { rows, titles } = await getData()

  return (
    <>
      <Topbar title="Date Corrections" />
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 md:p-6 space-y-4">
        <div>
          <h2 className="text-[#1d1d1f] font-heading font-bold text-xl tracking-tight">User-submitted date corrections</h2>
          <p className="text-[#6e6e73] text-sm mt-0.5">
            {rows.length} pending correction{rows.length !== 1 ? 's' : ''}. Approving writes the suggested date onto the listing.
          </p>
        </div>

        <div className="bg-white rounded-[16px] border border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[960px]">
              <thead>
                <tr className="bg-[#fafafa]">
                  {['Listing', 'Field', 'Suggested date', 'Note', 'Source', 'Submitted', 'Actions'].map((h) => (
                    <th key={h} className="px-5 py-2.5 text-left text-[10px] font-semibold text-[#aeaeb2] uppercase tracking-wider border-b border-black/[0.05] whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-black/[0.015] transition-colors align-top">
                    <td className="px-5 py-3 border-b border-black/[0.04] text-[13px] text-[#1d1d1f]">
                      <span className="font-medium">{titles[row.listing_slug] ?? row.listing_slug}</span>
                      {titles[row.listing_slug] && (
                        <span className="block text-[11px] text-[#aeaeb2]">{row.listing_slug}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 border-b border-black/[0.04] text-[13px] text-[#6e6e73] whitespace-nowrap">
                      {FIELD_LABELS[row.field] ?? row.field}
                    </td>
                    <td className="px-5 py-3 border-b border-black/[0.04] text-[13px] font-medium text-[#1d1d1f] whitespace-nowrap">
                      {fmtDate(row.suggested_date)}
                    </td>
                    <td className="px-5 py-3 border-b border-black/[0.04] text-[13px] text-[#6e6e73] max-w-[240px]">
                      {row.note || '—'}
                    </td>
                    <td className="px-5 py-3 border-b border-black/[0.04] text-[13px]">
                      {row.source_url ? (
                        <a
                          href={row.source_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[#800000] underline break-all"
                        >
                          Link
                        </a>
                      ) : (
                        <span className="text-[#aeaeb2]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 border-b border-black/[0.04] text-[12px] text-[#6e6e73] whitespace-nowrap">
                      {fmtDate(row.created_at)}
                    </td>
                    <td className="px-5 py-3 border-b border-black/[0.04]">
                      <DateContributionActions id={row.id} />
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-5 py-10 text-center text-sm text-[#aeaeb2]">
                      No pending date corrections.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  )
}
