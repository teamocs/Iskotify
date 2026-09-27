'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, controlClass } from '@/components/ui/Field'
import { DataTable, type Column, type FilterDef } from '@/components/ui/DataTable'
import { EmptyState } from '@/components/ui/EmptyState'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { ConfirmDialog } from './ConfirmDialog'
import { notifySuccess, notifyError } from '@/lib/toast'
import { errorMessage } from '@/lib/errorMessage'
import type { ImportBatch, ImportBatchSummary } from '@/lib/listings/types'
import type { ImportRow } from '@/lib/listings/planImport'

interface Props {
  preview: ImportBatch | null
  history: ImportBatchSummary[]
  lastUrl: string | null
  serviceAccountEmail: string | null
}

const ACTION_LABEL: Record<ImportRow['action'], string> = { new: 'New', update: 'Updated', unchanged: 'Unchanged' }
const ACTION_TONE: Record<ImportRow['action'], BadgeTone> = { new: 'success', update: 'info', unchanged: 'neutral' }

const ROW_COLUMNS: Column<ImportRow>[] = [
  { id: 'title', header: 'Title', cell: r => r.title, sortValue: r => r.title, searchValue: r => `${r.title} ${r.slug}` },
  { id: 'slug', header: 'Slug', cell: r => <span className="font-mono text-xs text-ink-muted">{r.slug}</span>, hideOnMobile: true },
  { id: 'type', header: 'Type', cell: r => r.listing.type, hideOnMobile: true },
  { id: 'status', header: 'Status', cell: r => r.listing.status, hideOnMobile: true },
  { id: 'action', header: 'Change', cell: r => <Badge tone={ACTION_TONE[r.action]}>{ACTION_LABEL[r.action]}</Badge> },
  { id: 'changes', header: 'Changed fields', cell: r => (r.changes.length ? r.changes.join(', ') : '—'), hideOnMobile: true },
]

const ROW_FILTERS: FilterDef<ImportRow>[] = [
  {
    id: 'action',
    label: 'Change',
    options: [
      { value: 'new', label: 'New' },
      { value: 'update', label: 'Updated' },
      { value: 'unchanged', label: 'Unchanged' },
    ],
    predicate: (row, value) => row.action === value,
  },
]

const HISTORY_COLUMNS: Column<ImportBatchSummary>[] = [
  {
    id: 'when',
    header: 'When',
    cell: r => new Date(r.created_at).toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    sortValue: r => new Date(r.created_at).getTime(),
  },
  {
    id: 'sheet',
    header: 'Sheet',
    cell: r => (
      <a href={r.sheet_url} target="_blank" rel="noopener noreferrer" className="text-maroon hover:underline">
        {r.sheet_title ?? r.sheet_id}
      </a>
    ),
    searchValue: r => `${r.sheet_title ?? ''} ${r.sheet_id}`,
  },
  {
    id: 'outcome',
    header: 'Outcome',
    cell: r => <Badge tone={r.status === 'published' ? 'success' : 'neutral'}>{r.status === 'published' ? 'Published' : 'Discarded'}</Badge>,
  },
  { id: 'new', header: 'New', cell: r => r.new_count, numeric: true },
  { id: 'updated', header: 'Updated', cell: r => r.update_count, numeric: true },
  { id: 'closed', header: 'Closed', cell: r => r.closed_count, numeric: true },
  { id: 'invalid', header: 'Invalid', cell: r => r.invalid_count, numeric: true },
]

export function ListingSheetImport({ preview, history, lastUrl, serviceAccountEmail }: Props) {
  const router = useRouter()
  const [url, setUrl] = useState(lastUrl ?? '')
  const [loadingPreview, setLoadingPreview] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [closeMissing, setCloseMissing] = useState(false)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [isMutating, startMutation] = useTransition()

  async function handleLoadPreview(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!url.trim()) return
    setLoadError(null)
    setLoadingPreview(true)
    try {
      const res = await fetch('/api/admin/listings/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        const message = body.error ?? 'Could not load the sheet'
        setLoadError(message)
        notifyError(message)
        return
      }
      notifySuccess(`Loaded preview — ${body.new_count} new · ${body.update_count} updated · ${body.unchanged_count} unchanged`)
      router.refresh()
    } catch (err) {
      const message = errorMessage(err, 'Network error — could not load the sheet')
      setLoadError(message)
      notifyError(message)
    } finally {
      setLoadingPreview(false)
    }
  }

  function handlePublish() {
    if (!preview) return
    startMutation(async () => {
      try {
        const res = await fetch(`/api/admin/listings/import/${preview.id}/publish`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ closeMissing }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          notifyError(body.error ?? 'Publish failed')
          return
        }
        notifySuccess(`Published — ${body.new} new · ${body.update} updated${body.closed ? ` · ${body.closed} closed` : ''}`)
        setCloseMissing(false)
        router.refresh()
      } catch (err) {
        notifyError(errorMessage(err, 'Publish failed'))
      }
    })
  }

  function handleDiscard() {
    if (!preview) return
    startMutation(async () => {
      try {
        const res = await fetch(`/api/admin/listings/import/${preview.id}`, { method: 'DELETE' })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          notifyError(body.error ?? 'Discard failed')
          return
        }
        notifySuccess('Preview discarded')
        setConfirmingDiscard(false)
        router.refresh()
      } catch (err) {
        notifyError(errorMessage(err, 'Discard failed'))
      }
    })
  }

  const changeCount = preview ? preview.new_count + preview.update_count : 0
  const willClose = closeMissing && (preview?.missing.length ?? 0) > 0
  const publishDisabled = !preview || isMutating || (changeCount === 0 && !willClose)

  return (
    <div className="space-y-4">
      <Card title="Google Sheets link" description="Paste a link to the sheet with your listings.">
        <form onSubmit={handleLoadPreview} className="space-y-3">
          <Field
            label="Sheet URL"
            hint={
              <>
                Required columns: <code>type</code> and <code>title</code> (slug is optional — it&apos;s derived from the
                title). Separate list values (requirements, tags, target courses, events…) with <code>|</code>.
                {serviceAccountEmail && (
                  <>
                    {' '}Share the sheet with <code>{serviceAccountEmail}</code> (Viewer), or set its general access to
                    &quot;Anyone with the link&quot;.
                  </>
                )}
              </>
            }
          >
            {p => (
              <input
                {...p}
                type="url"
                inputMode="url"
                required
                value={url}
                onChange={e => setUrl(e.target.value)}
                placeholder="https://docs.google.com/spreadsheets/d/…"
                className={controlClass}
              />
            )}
          </Field>
          {loadError && <ErrorBanner title="Could not load the sheet" message={loadError} />}
          <Button type="submit" variant="primary" icon="upload" loading={loadingPreview} disabled={!url.trim()}>
            {loadingPreview ? 'Loading…' : 'Load preview'}
          </Button>
        </form>
      </Card>

      {preview && (
        <Card title="Preview" description={preview.sheet_title ?? preview.sheet_id}>
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="success">New {preview.new_count}</Badge>
              <Badge tone="info">Updated {preview.update_count}</Badge>
              <Badge tone="neutral">Unchanged {preview.unchanged_count}</Badge>
              {preview.invalid_count > 0 && <Badge tone="danger">Invalid {preview.invalid_count}</Badge>}
              {preview.missing.length > 0 && <Badge tone="warning">Not in sheet {preview.missing.length}</Badge>}
              {preview.mapped_by_ai && (
                <details className="ml-1">
                  <summary className="inline-flex cursor-pointer list-none [&::-webkit-details-marker]:hidden">
                    <Badge tone="info">Mapped by AI</Badge>
                  </summary>
                  <div className="mt-2 space-y-0.5 rounded-sm bg-neutral-soft p-2 text-xs text-ink-muted">
                    {Object.entries(preview.column_map ?? {}).map(([field, header]) => (
                      <div key={field}>
                        <span className="font-medium text-ink">{field}</span> ← {header}
                      </div>
                    ))}
                  </div>
                </details>
              )}
            </div>

            <DataTable
              label="Sheet rows"
              rows={preview.rows}
              columns={ROW_COLUMNS}
              rowKey={r => r.slug}
              filters={ROW_FILTERS}
              paramPrefix="rows_"
              searchPlaceholder="Search rows…"
              emptyTitle="No rows"
            />

            {preview.invalid.length > 0 && (
              <div className="space-y-1.5">
                <h3 className="text-sm font-semibold text-ink">Invalid rows</h3>
                <ul className="space-y-1 text-ui text-danger-strong">
                  {preview.invalid.map(row => (
                    <li key={row.row}>
                      Row {row.row}{row.title ? ` (${row.title})` : ''}: {row.errors.join('; ')}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {preview.missing.length > 0 && (
              <div className="space-y-2">
                <h3 className="text-sm font-semibold text-ink">Not in this sheet</h3>
                <ul className="space-y-1 text-ui text-ink-muted">
                  {preview.missing.map(m => (
                    <li key={m.slug}>
                      {m.title} <span className="text-xs">({m.status})</span>
                    </li>
                  ))}
                </ul>
                <label className="inline-flex cursor-pointer items-center gap-2 text-ui text-ink">
                  <input
                    type="checkbox"
                    className="h-4 w-4 cursor-pointer accent-maroon"
                    checked={closeMissing}
                    onChange={e => setCloseMissing(e.target.checked)}
                  />
                  Close these {preview.missing.length} listing{preview.missing.length === 1 ? '' : 's'} when publishing
                </label>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2 border-t border-subtle pt-3">
              <Button variant="danger" icon="trash" onClick={() => setConfirmingDiscard(true)} disabled={isMutating}>
                Discard
              </Button>
              <Button variant="primary" icon="check" onClick={handlePublish} loading={isMutating} disabled={publishDisabled}>
                Publish {changeCount} change{changeCount === 1 ? '' : 's'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Card title="History" flush={history.length > 0}>
        {history.length === 0 ? (
          <EmptyState title="No imports yet" description="Published and discarded batches will show up here." />
        ) : (
          <DataTable
            label="Import history"
            rows={history}
            columns={HISTORY_COLUMNS}
            rowKey={r => r.id}
            paramPrefix="history_"
            searchPlaceholder="Search history…"
          />
        )}
      </Card>

      {confirmingDiscard && preview && (
        <ConfirmDialog
          message={`Discard this preview of "${preview.sheet_title ?? preview.sheet_id}"? Nothing will be published.`}
          confirmLabel="Discard"
          onConfirm={handleDiscard}
          onCancel={() => setConfirmingDiscard(false)}
        />
      )}
    </div>
  )
}
