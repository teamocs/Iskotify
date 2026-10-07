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
import type { AnnouncementBatch, AnnouncementBatchSummary, AnnouncementRow, UpdateSeverity } from '@/lib/announcements/types'
import { toSourceLinks } from '@/lib/announcements/sources'
import { HeldFiles } from './HeldFiles'
import { jsonInit, plural, type ContentFileRow } from './types'

interface Props {
  previews: AnnouncementBatch[]
  history: AnnouncementBatchSummary[]
  /** Report files the sync held back (e.g. unreadable AI output), failed on or skipped. */
  files: ContentFileRow[]
}

const SEVERITY: Record<UpdateSeverity, { label: string; tone: BadgeTone }> = {
  urgent: { label: 'Urgent', tone: 'danger' },
  important: { label: 'Important', tone: 'warning' },
  info: { label: 'Info', tone: 'neutral' },
}

const fmtDate = (iso: string | null) =>
  iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-PH', { dateStyle: 'medium', timeZone: 'UTC' }) : null

const HISTORY_COLUMNS: Column<AnnouncementBatchSummary>[] = [
  { id: 'when', header: 'Synced', sortValue: r => new Date(r.created_at), cell: r => <span className="whitespace-nowrap">{fmtDateTime(r.created_at)}</span> },
  { id: 'file', header: 'Report', searchValue: r => r.file_name, cell: r => <span className="break-all">{r.file_name}</span> },
  { id: 'date', header: 'Report date', hideOnMobile: true, cell: r => fmtDate(r.report_date) ?? '—' },
  { id: 'outcome', header: 'Outcome', cell: r => <Badge tone={r.status === 'published' ? 'success' : 'neutral'}>{r.status === 'published' ? 'Published' : 'Discarded'}</Badge> },
  { id: 'published', header: 'Published', numeric: true, cell: r => r.published_count },
]

function Row({ row, included, onToggle, disabled }: { row: AnnouncementRow; included: boolean; onToggle: () => void; disabled: boolean }) {
  const u = row.update
  const sev = SEVERITY[u.severity]
  const reviewable = row.action !== 'unchanged'
  // http(s)-only {label, url} links, whatever shape the stored row has.
  const sources = toSourceLinks(u.sources)
  return (
    <li className={['flex gap-3 px-4 py-3', reviewable && !included ? 'opacity-60' : ''].filter(Boolean).join(' ')}>
      <div className="pt-0.5">
        {reviewable ? (
          <input
            type="checkbox"
            className="h-4 w-4 cursor-pointer accent-maroon"
            checked={included}
            disabled={disabled}
            onChange={onToggle}
            aria-label={`Publish “${u.title}”`}
          />
        ) : <span className="block h-4 w-4" aria-hidden="true" />}
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <Badge tone={sev.tone}>{sev.label}</Badge>
          {row.action === 'new' && <Badge tone="success">New</Badge>}
          {row.action === 'update' && <Badge tone="info">{`Changed: ${row.changes.join(', ')}`}</Badge>}
          {row.action === 'unchanged' && <Badge tone="neutral">No change</Badge>}
          {!u.verified && <Badge tone="warning">Unverified</Badge>}
          {row.warning && reviewable && <Badge tone="danger">Needs a check</Badge>}
        </span>
        <p className="font-medium text-ink">{u.title}</p>
        <p className="text-xs text-ink-muted">
          {[u.school_name, u.event_date ? `${u.event_type ? `${u.event_type[0]!.toUpperCase()}${u.event_type.slice(1)}` : 'Date'}: ${fmtDate(u.event_date)}` : null].filter(Boolean).join(' · ')}
        </p>
        <p className="text-ui text-ink">{u.body}</p>
        {u.action_required && <p className="text-xs text-ink"><span className="font-medium">Action: </span>{u.action_required}</p>}
        {sources.length > 0 && (
          <p className="flex flex-wrap gap-x-3 text-xs">
            {sources.map(s => (
              <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="text-maroon underline underline-offset-2 hover:no-underline break-all">{s.url}</a>
            ))}
          </p>
        )}
        {row.warning && reviewable && (
          <p role="note" className="rounded-sm bg-warning-soft px-2 py-1 text-xs text-warning-strong">
            <span className="font-medium">Check before publishing: </span>{row.warning} Tick it to publish it anyway.
          </p>
        )}
        <details className="text-xs text-ink-muted">
          <summary className="cursor-pointer">From the report</summary>
          <blockquote className="mt-1 border-l-2 border-subtle pl-2">{row.quote}</blockquote>
        </details>
      </div>
    </li>
  )
}

function Preview({ batch, busy, onPublish, onDiscard }: {
  batch: AnnouncementBatch
  busy: boolean
  onPublish: (ids: { excludeIds: string[]; confirmIds: string[] }) => void
  onDiscard: () => void
}) {
  const reviewable = batch.rows.filter(r => r.action !== 'unchanged')
  // Flagged rows (title/summary not backed by the report) start unticked.
  const [ticked, setTicked] = useState<Set<string>>(() => new Set(reviewable.filter(r => !r.warning).map(r => r.id)))
  const toggle = (id: string) => setTicked(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  const count = reviewable.filter(r => ticked.has(r.id)).length
  const publish = () => onPublish({
    excludeIds: reviewable.filter(r => !ticked.has(r.id)).map(r => r.id),
    confirmIds: reviewable.filter(r => r.warning && ticked.has(r.id)).map(r => r.id),
  })

  return (
    <li>
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <a href={`https://drive.google.com/open?id=${encodeURIComponent(batch.drive_file_id)}`} target="_blank" rel="noopener noreferrer" className="font-medium text-ink underline-offset-2 hover:underline break-all">
            {batch.file_name}<span className="sr-only"> (opens Google Drive)</span>
          </a>
          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
            {batch.report_date && <span>{`Report of ${fmtDate(batch.report_date)}`}</span>}
            <Badge tone="success">{`${batch.new_count} new`}</Badge>
            <Badge tone="info">{`${batch.update_count} updated`}</Badge>
            {batch.unchanged_count > 0 && <Badge tone="neutral">{`${batch.unchanged_count} unchanged`}</Badge>}
            {batch.skipped_count > 0 && <Badge tone="warning">{`${batch.skipped_count} left out`}</Badge>}
            <span>{`Read ${fmtDateTime(batch.created_at)}`}</span>
          </span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="danger" icon="trash" disabled={busy} onClick={onDiscard}>Discard</Button>
          <Button size="sm" variant="primary" icon="check" loading={busy} disabled={busy || count === 0} onClick={publish}>
            {`Publish ${plural(count, 'announcement')}`}
          </Button>
        </div>
      </div>
      <ul aria-label={`Announcements in ${batch.file_name}`} className="divide-y divide-subtle border-t border-subtle">
        {batch.rows.map(r => <Row key={r.id} row={r} included={ticked.has(r.id)} onToggle={() => toggle(r.id)} disabled={busy} />)}
      </ul>
      {batch.skipped.length > 0 && (
        <details className="border-t border-subtle px-4 py-3">
          <summary className="cursor-pointer text-ui font-medium text-ink">{`Left out by the checks (${batch.skipped.length})`}</summary>
          <ul className="mt-2 space-y-1 text-ui">
            {batch.skipped.map((s, i) => (
              <li key={i}><span className="font-medium text-ink">{s.title}</span><span className="block text-xs text-ink-muted">{s.reason}</span></li>
            ))}
          </ul>
        </details>
      )}
    </li>
  )
}

/**
 * Announcements read by the AI from the weekly admissions report Docs. Nothing
 * goes live until an admin publishes; each row can be left out first.
 */
export function DriveAnnouncementsCard({ previews, history, files }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [discarding, setDiscarding] = useState<AnnouncementBatch | null>(null)

  async function publish(b: AnnouncementBatch, ids: { excludeIds: string[]; confirmIds: string[] }) {
    setBusy(b.id)
    const r = await apiRequest<{ published: number; skippedStale: string[] }>(`/api/admin/announcements/import/${encodeURIComponent(b.id)}/publish`, jsonInit('POST', ids))
    setBusy(null)
    if (!r.ok) return notifyError(r.error)
    const stale = r.data.skippedStale?.length ?? 0
    notifySuccess(`Published ${plural(r.data.published, 'announcement')} to the app’s News${stale ? ` · ${stale} skipped (edited in Admissions updates since this preview)` : ''}`)
    router.refresh()
  }

  async function discard(b: AnnouncementBatch) {
    setBusy(b.id)
    const r = await apiRequest(`/api/admin/announcements/import/${encodeURIComponent(b.id)}`, { method: 'DELETE' })
    setBusy(null)
    setDiscarding(null)
    if (!r.ok) return notifyError(r.error)
    notifySuccess('Preview discarded')
    router.refresh()
  }

  return (
    <Card
      id="drive-announcements"
      title="Announcements from Drive"
      description="The AI reads each weekly report Doc into announcements, checked against the report’s own text. Nothing goes live until you publish."
      flush
      className="scroll-mt-16"
    >
      {previews.length > 0 ? (
        <ul aria-label="Announcement previews" className="divide-y divide-subtle">
          {previews.map(b => (
            <Preview key={b.id} batch={b} busy={busy === b.id} onPublish={(ids) => publish(b, ids)} onDiscard={() => setDiscarding(b)} />
          ))}
        </ul>
      ) : (
        <EmptyState icon="megaphone" title="Nothing waiting to publish" description="When a report Doc is added or changed in an announcements folder, its announcements show up here." />
      )}
      <HeldFiles files={files} label="Report files" />
      {history.length > 0 && (
        <details className="border-t border-subtle">
          <summary className="cursor-pointer px-4 py-3 text-ui font-medium text-ink">{`History (${history.length})`}</summary>
          <DataTable label="Announcements sync history" rows={history} columns={HISTORY_COLUMNS} rowKey={r => r.id} paramPrefix="da_" searchable={false} />
        </details>
      )}
      {discarding && (
        <ConfirmDialog
          message={`Discard the announcements read from “${discarding.file_name}”? Nothing is published; the Doc makes a new preview when it changes.`}
          confirmLabel="Discard"
          onConfirm={() => discard(discarding)}
          onCancel={() => setDiscarding(null)}
        />
      )}
    </Card>
  )
}
