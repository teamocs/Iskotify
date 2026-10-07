import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { PageBody } from '@/components/ui/Page'
import { ListingSheetImport } from '@/components/admin/ListingSheetImport'
import { serviceAccountEmail } from '@/lib/google/serviceAccount'
import { HISTORY_COLUMNS, lastSheetUrl, type ImportBatch, type ImportBatchSummary } from '@/lib/listings/types'

export const dynamic = 'force-dynamic'

async function getData() {
  const db = createServerClient()
  const [previewRes, historyRes] = await Promise.all([
    // Only the pasted-link preview; the Drive sync's per-file previews are on /admin/sync.
    db.from('listing_import_batches').select('*').eq('status', 'preview').is('drive_file_id', null).order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('listing_import_batches').select(HISTORY_COLUMNS).in('status', ['published', 'discarded']).order('created_at', { ascending: false }).limit(50),
  ])
  const preview = (previewRes.data ?? null) as ImportBatch | null
  const history = (historyRes.data ?? []) as unknown as ImportBatchSummary[]
  return { preview, history, lastUrl: lastSheetUrl(preview, history) }
}

export default async function ListingImportPage() {
  const { preview, history, lastUrl } = await getData()

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title="Import listings" />
      <PageBody
        width="wide"
        intro="Paste a Google Sheets link to preview the listings it describes, review what would change, then publish."
      >
        <ListingSheetImport
          preview={preview}
          history={history}
          lastUrl={lastUrl}
          serviceAccountEmail={serviceAccountEmail()}
        />
      </PageBody>
    </div>
  )
}
