'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { ConfirmDialog } from '../ConfirmDialog'
import { apiRequest } from '@/lib/apiRequest'
import { notifyError, notifySuccess } from '@/lib/toast'
import { fmtDateTime } from '../questionSync/types'
import type { ImportBatch, ImportBatchSummary } from '@/lib/listings/types'
import type { ImportRow } from '@/lib/listings/planImport'
import { HeldFiles } from './HeldFiles'
import { jsonInit, plural, type ContentFileRow } from './types'

interface Props {
  /** Drive-sync listing previews (one per Drive file). */
  previews: ImportBatch[]
  history: ImportBatchSummary[]
  /** Listings files the sync held back, failed on or skipped. */
  files: ContentFileRow[]
}

const ACTION: Record<ImportRow['action'], { label: string; tone: BadgeTone }> = {
  new: { label: 'New', tone: 'success' },
  update: { label: 'Updated', tone: 'info' },
  unchanged: { label: 'Unchanged', tone: 'neutral' },
}

const HISTORY_COLUMNS: Column<ImportBatchSummary>[] = [
  { id: 'when', header: 'Synced', sortValue: r => new Date(r.created_at), cell: r => <span className="whitespace-nowrap">{fmtDateTime(r.created_at)}</span> },
  {
    id: 'file', header: 'File', searchValue: r => r.sheet_title ?? r.sheet_id,
    cell: r => <a href={r.sheet_url} target="_blank" rel="noopener noreferrer" className="text-maroon hover:underline break-all">{r.sheet_title ?? r.sheet_id}</a>,
  },
  { id: 'outcome', header: 'Outcome', cell: r => <Badge tone={r.status === 'published' ? 'success' : 'neutral'}>{r.status === 'published' ? 'Published' : 'Discarded'}</Badge> },
  { id: 'new', header: 'New', numeric: true, cell: r => r.new_count },
  { id: 'updated', header: 'Updated', numeric: true, cell: r => r.update_count },
  { id: 'invalid', header: 'Invalid', numeric: true, hideOnMobile: true, cell: r => r.invalid_count },
]

function Preview({ batch, busy, onPublish, onDiscard }: { batch: ImportBatch; busy: boolean; onPublish: () => void; onDiscard: () => void }) {
  const changes = batch.new_count + batch.update_count
  const changed = batch.rows.filter(r => r.action !== 'unchanged')
  return (
    <li className="space-y-2 px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <a href={batch.sheet_url} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline-offset-2 hover:underline break-all">
            {batch.sheet_title ?? batch.sheet_id}<span className="sr-only"> (opens Google Drive)</span>
          </a>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
            <Badge tone="success">{`${batch.new_count} new`}</Badge>
            <Badge tone="info">{`${batch.update_count} updated`}</Badge>
            <Badge tone="neutral">{`${batch.unchanged_count} unchanged`}</Badge>
            {batch.invalid_count > 0 && <Badge tone="danger">{`${batch.invalid_count} invalid`}</Badge>}
            {batch.mapped_by_ai && <Badge tone="info">Mapped by AI</Badge>}
            <span>{`Synced ${fmtDateTime(batch.created_at)}`}</span>
          </span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="danger" icon="trash" disabled={busy} onClick={onDiscard}>Discard</Button>
          <Button size="sm" variant="primary" icon="check" loading={busy} disabled={busy || changes === 0} onClick={onPublish}>
            {`Publish ${plural(changes, 'change')}`}
          </Button>
        </div>
      </div>
      <details>
        <summary className="cursor-pointer text-ui font-medium text-ink">{`Review ${plural(changed.length, 'change')}`}</summary>
        <ul className="mt-2 space-y-1">
          {changed.map(r => (
            <li key={r.slug} className="flex flex-wrap items-center gap-2 text-ui">
              <Badge tone={ACTION[r.action].tone}>{ACTION[r.action].label}</Badge>
              <span className="font-medium text-ink">{r.title}</span>
              <span className="text-xs text-ink-muted">{r.listing.type}{r.changes.length ? ` · ${r.changes.join(', ')}` : ''}</span>
            </li>
          ))}
        </ul>
        {batch.invalid.length > 0 && (
          <ul className="mt-2 space-y-1 text-ui text-danger-strong">
            {batch.invalid.map(r => <li key={r.row}>{`Row ${r.row}${r.title ? ` (${r.title})` : ''}: ${r.errors.join('; ')}`}</li>)}
          </ul>
        )}
      </details>
    </li>
  )
}

/** Listings sheets from the Drive listings folders: one preview per file → Publish → History. */
export function DriveListingsCard({ previews, history, files }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [discarding, setDiscarding] = useState<ImportBatch | null>(null)

  async function publish(b: ImportBatch) {
    setBusy(b.id)
    const r = await apiRequest<{ new: number; update: number }>(`/api/admin/listings/import/${encodeURIComponent(b.id)}/publish`, jsonInit('POST', {}))
    setBusy(null)
    if (!r.ok) return notifyError(r.error)
    notifySuccess(`${b.sheet_title ?? 'Listings'}: published ${r.data.new} new · ${r.data.update} updated`)
    router.refresh()
  }

  async function discard(b: ImportBatch) {
    setBusy(b.id)
    const r = await apiRequest(`/api/admin/listings/import/${encodeURIComponent(b.id)}`, { method: 'DELETE' })
    setBusy(null)
    setDiscarding(null)
    if (!r.ok) return notifyError(r.error)
    notifySuccess('Preview discarded')
    router.refresh()
  }

  return (
    <Card
      id="drive-listings"
      title="Listings from Drive"
      description="Exam and scholarship sheets from your listings folders. Each changed file waits here; publishing updates only the sheet-owned fields."
      flush
      className="scroll-mt-16"
    >
      {previews.length > 0 ? (
        <ul aria-label="Listings previews" className="divide-y divide-subtle">
          {previews.map(b => (
            <Preview key={b.id} batch={b} busy={busy === b.id} onPublish={() => publish(b)} onDiscard={() => setDiscarding(b)} />
          ))}
        </ul>
      ) : (
        <EmptyState icon="check" title="Nothing waiting to publish" description="When a listings sheet in Drive changes, its preview shows up here." />
      )}
      <HeldFiles files={files} label="Listings files" />
      {history.length > 0 && (
        <details className="border-t border-subtle">
          <summary className="cursor-pointer px-4 py-3 text-ui font-medium text-ink">{`History (${history.length})`}</summary>
          <DataTable label="Listings sync history" rows={history} columns={HISTORY_COLUMNS} rowKey={r => r.id} paramPrefix="dl_" searchable={false} />
        </details>
      )}
      {discarding && (
        <ConfirmDialog
          message={`Discard the preview of “${discarding.sheet_title ?? discarding.sheet_id}”? Nothing is published; the file makes a new preview when it changes.`}
          confirmLabel="Discard"
          onConfirm={() => discard(discarding)}
          onCancel={() => setDiscarding(null)}
        />
      )}
    </Card>
  )
}
