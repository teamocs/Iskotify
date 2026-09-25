import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { PageBody } from '@/components/ui/Page'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { DateContributionsTable, type Contribution } from '@/components/admin/DateContributionsTable'

export const dynamic = 'force-dynamic'

// Pending rows sort first; reviewed ones stay visible (status filter) for context.
const ROW_LIMIT = 500

async function getData(): Promise<{ rows: Contribution[]; titles: Record<string, string>; error: string | null }> {
  const db = createServerClient()

  const { data, error } = await db
    .from('listing_date_contributions')
    .select('id,listing_slug,field,suggested_date,note,source_url,status,created_at')
    .order('created_at', { ascending: false })
    .order('id')
    .limit(ROW_LIMIT)

  if (error) return { rows: [], titles: {}, error: error.message }
  const rows = (data ?? []) as Contribution[]

  const titles: Record<string, string> = {}
  const slugs = Array.from(new Set(rows.map((r) => r.listing_slug).filter(Boolean)))
  if (slugs.length > 0) {
    // Titles are a nicety: on failure the table falls back to the slug.
    const { data: listingData } = await db.from('listings').select('slug,title').in('slug', slugs)
    for (const l of (listingData ?? []) as { slug: string; title: string | null }[]) {
      if (l.slug && l.title) titles[l.slug] = l.title
    }
  }

  return { rows, titles, error: null }
}

export default async function DateContributionsPage() {
  const { rows, titles, error } = await getData()
  const pending = rows.filter((r) => r.status === 'pending').length

  return (
    <>
      <Topbar title="Date Corrections" />
      <PageBody
        intro={
          error
            ? 'Dates students suggest for listings. Approving writes the suggested date onto the listing.'
            : `${pending} pending correction${pending !== 1 ? 's' : ''}. Approving writes the suggested date onto the listing.`
        }
      >
        {error ? (
          <ErrorBanner title="Couldn’t load date corrections" message={error} />
        ) : (
          <DateContributionsTable rows={rows} titles={titles} />
        )}
      </PageBody>
    </>
  )
}
