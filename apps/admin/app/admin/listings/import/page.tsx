import { createServerClient } from '@iskotify/utils'
import { Topbar } from '@/components/admin/Topbar'
import { PageBody } from '@/components/ui/Page'
import { ListingSheetImport } from '@/components/admin/ListingSheetImport'
import type { ImportBatch, ImportBatchSummary } from '@/lib/listings/types'

export const dynamic = 'force-dynamic'

const HISTORY_COLUMNS = [
  'id', 'sheet_id', 'sheet_url', 'sheet_title', 'tab', 'status', 'mapped_by_ai', 'column_map',
  'new_count', 'update_count', 'unchanged_count', 'invalid_count', 'closed_count',
  'created_by', 'created_at', 'published_by', 'published_at', 'discarded_at',
].join(', ')

function serviceAccountEmail(): string | null {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { client_email?: unknown }
    return typeof parsed.client_email === 'string' ? parsed.client_email : null
  } catch {
    return null
  }
}

async function getData() {
  const db = createServerClient()
  const [previewRes, historyRes] = await Promise.all([
    db.from('listing_import_batches').select('*').eq('status', 'preview').order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.from('listing_import_batches').select(HISTORY_COLUMNS).in('status', ['published', 'discarded']).order('created_at', { ascending: false }).limit(50),
  ])
  const preview = (previewRes.data ?? null) as ImportBatch | null
  const history = (historyRes.data ?? []) as unknown as ImportBatchSummary[]
  const defaultSheetId = process.env.GOOGLE_SHEETS_ID
  const lastUrl =
    preview?.sheet_url ??
    history[0]?.sheet_url ??
    (defaultSheetId ? `https://docs.google.com/spreadsheets/d/${defaultSheetId}/edit` : null)
  return { preview, history, lastUrl }
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
