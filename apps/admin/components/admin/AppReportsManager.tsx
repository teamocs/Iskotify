'use client'

import { useEffect, useMemo, useState } from 'react'
import { DataTable, type Column, type FilterDef } from '@/components/ui/DataTable'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button, buttonClass } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { TABLE_FRAME } from '@/components/ui/Table'
import { Icon } from '@/components/ui/Icon'
import { PageBody } from '@/components/ui/Page'
import type { ReviewStatus } from '@/lib/admin/bulkStatus'
import { APP_REPORTS_QUEUE, QUEUE_PAGE_SIZE } from '@/lib/admin/queueSpecs'
import { ConfirmDialog } from './ConfirmDialog'
import { BulkStatusActions, ClampText, QueueRowActions, StatusBadge, fmtDate, statusFilter, useStatusQueue } from './StatusQueue'

// ── Types ───────────────────────────────────────────────────────────────────

export interface AppBugReport {
  id: string
  user_id: string | null
  screen: string | null
  description: string | null
  image_url: string | null
  app_version: string | null
  platform: string | null
  status: ReviewStatus
  created_at: string
  updated_at: string
}

const PLATFORM: Record<string, { label: string; tone: BadgeTone }> = {
  ios: { label: 'iOS', tone: 'neutral' },
  android: { label: 'Android', tone: 'success' },
}

function PlatformBadge({ platform }: { platform: string | null }) {
  if (!platform) return <span className="text-ink-subtle">—</span>
  const p = PLATFORM[platform.toLowerCase()]
  return <Badge tone={p?.tone ?? 'info'}>{p?.label ?? platform}</Badge>
}

const FILTERS: FilterDef<AppBugReport>[] = [
  statusFilter<AppBugReport>(),
  {
    id: 'platform',
    label: 'Platform',
    allLabel: 'All platforms',
    options: [{ value: 'android', label: 'Android' }, { value: 'ios', label: 'iOS' }, { value: 'other', label: 'Other' }],
  },
]

const shortLabel = (r: AppBugReport) => {
  const t = (r.screen || r.description || 'Untitled').trim()
  return t.length > 60 ? `${t.slice(0, 60)}…` : t
}

// ── Screenshot lightbox ─────────────────────────────────────────────────────
// Screenshots sit in a PRIVATE bucket. The lightbox never uses the stored
// image_url (a path, or an old public URL) as an image source: it asks the
// admin-only route for a short-lived signed URL and shows that.

/** The admin-only route that signs a report's screenshot. */
export function screenshotEndpoint(reportId: string): string {
  return `/api/admin/app-reports/${encodeURIComponent(reportId)}/screenshot`
}

export type ScreenshotState =
  | { status: 'loading' }
  | { status: 'ready'; url: string }
  | { status: 'error' }

/** The dialog itself, given where the signed link stands. Pure, so it's testable. */
export function ScreenshotDialog({ report, state, onClose }: { report: AppBugReport; state: ScreenshotState; onClose: () => void }) {
  const screen = report.screen || 'unknown'
  return (
    <Dialog
      open
      onClose={onClose}
      size="xl"
      title={`Screenshot: ${report.screen || 'Bug report'}`}
      description={report.description
        ? (report.description.length > 200 ? `${report.description.slice(0, 200)}…` : report.description)
        : undefined}
      footer={close => (
        <>
          {state.status === 'ready' ? (
            <a href={state.url} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: 'ghost', className: 'mr-auto' })}>
              Open original <Icon name="arrow-right" />
              <span className="sr-only">(opens in a new tab; the link expires in a few minutes)</span>
            </a>
          ) : null}
          <Button onClick={close}>Close</Button>
        </>
      )}
    >
      {state.status === 'ready' ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          src={state.url}
          alt={`Screenshot of the ${screen} screen attached to this bug report`}
          className="mx-auto max-h-[70vh] rounded-sm border border-subtle object-contain"
        />
      ) : state.status === 'loading' ? (
        <p className="py-10 text-center text-sm text-ink-muted" role="status">Loading screenshot…</p>
      ) : (
        <p className="py-10 text-center text-sm text-danger-strong" role="alert">Couldn’t open this screenshot. Close and try again.</p>
      )}
    </Dialog>
  )
}

/** Opens a report's screenshot: fetches a signed URL, then shows the dialog. */
export function ScreenshotLightbox({ report, onClose }: { report: AppBugReport | null; onClose: () => void }) {
  // The result is keyed by report id, so opening another report reads as
  // "loading" until its own link arrives (no synchronous reset in the effect).
  const [result, setResult] = useState<{ id: string; state: ScreenshotState } | null>(null)
  const reportId = report?.image_url ? report.id : null

  useEffect(() => {
    if (!reportId) return
    let cancelled = false
    fetch(screenshotEndpoint(reportId), { cache: 'no-store' })
      .then(async res => {
        const body = (await res.json().catch(() => ({}))) as { url?: unknown }
        if (cancelled) return
        setResult({ id: reportId, state: res.ok && typeof body.url === 'string' ? { status: 'ready', url: body.url } : { status: 'error' } })
      })
      .catch(() => { if (!cancelled) setResult({ id: reportId, state: { status: 'error' } }) })
    return () => { cancelled = true }
  }, [reportId])

  if (!report?.image_url) return null
  const state: ScreenshotState = result?.id === report.id ? result.state : { status: 'loading' }
  return <ScreenshotDialog report={report} state={state} onClose={onClose} />
}

// ── Table ───────────────────────────────────────────────────────────────────

interface ViewProps {
  /** The current page, as the server returned it (already searched, filtered and sorted). */
  rows: AppBugReport[]
  /** Rows matching the current search and filters, across every page. */
  total: number
  loading: boolean
  error: string
  selected: string[]
  onSelectedChange: (ids: string[]) => void
  bulkBusy: boolean
  /** Outcome of the last bulk action, announced to screen readers. */
  bulkResult?: string
  onBulk: (status: ReviewStatus) => void
  onRetry: () => void
  onViewScreenshot: (r: AppBugReport) => void
  onSetStatus: (id: string, status: ReviewStatus) => void
  onDelete: (r: AppBugReport) => void
}

export function AppReportsView({ rows, total, loading, error, selected, onSelectedChange, bulkBusy, bulkResult, onBulk, onRetry, onViewScreenshot, onSetStatus, onDelete }: ViewProps) {
  // Memoised so a selection change re-renders only the rows whose checkbox flipped.
  const columns = useMemo<Column<AppBugReport>[]>(() => [
    {
      id: 'screen',
      header: 'Screen',
      sortValue: r => r.screen,
      searchValue: r => r.screen ?? '',
      cell: r => <span className="block break-words font-medium">{r.screen || '—'}</span>,
    },
    {
      id: 'description',
      header: 'Description',
      searchValue: r => r.description ?? '',
      className: 'max-w-[24rem]',
      cell: r => <ClampText text={r.description || '—'} max={100} />,
    },
    {
      id: 'screenshot',
      header: 'Screenshot',
      // A placeholder, never a thumbnail: image_url is a private-bucket path (or
      // an old public URL) and must not become an image src. The lightbox shows
      // the picture through a short-lived signed URL.
      cell: r => r.image_url ? (
        <button
          type="button"
          onClick={() => onViewScreenshot(r)}
          aria-label={`View screenshot for ${shortLabel(r)} bug report`}
          className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border border-subtle bg-surface-2 px-2 py-1 text-xs font-medium text-ink-muted hover:border-strong hover:text-ink"
        >
          <Icon name="image" />
          Screenshot
        </button>
      ) : (
        <span className="text-ink-subtle">—</span>
      ),
    },
    {
      id: 'device',
      header: 'Device',
      sortValue: r => r.platform,
      searchValue: r => `${r.platform ?? ''} ${r.app_version ?? ''}`,
      cell: r => (
        <span className="whitespace-nowrap">
          <PlatformBadge platform={r.platform} />
          <span className="mt-1 block font-mono text-xs text-ink-muted">{r.app_version ? `v${r.app_version}` : '—'}</span>
        </span>
      ),
    },
    { id: 'status', header: 'Status', sortValue: r => r.status, cell: r => <StatusBadge status={r.status} /> },
    {
      id: 'reported',
      header: 'Reported',
      sortValue: r => new Date(r.created_at),
      cell: r => <span className="whitespace-nowrap tabular-nums text-ink-muted">{fmtDate(r.created_at)}</span>,
    },
    {
      id: 'actions',
      header: 'Actions',
      hideHeader: true,
      align: 'right',
      cell: r => (
        <QueueRowActions
          name={shortLabel(r)}
          status={r.status}
          onSetStatus={s => onSetStatus(r.id, s)}
          onDelete={() => onDelete(r)}
          deleteLabel="Delete bug report"
        />
      ),
    },
  ], [onSetStatus, onDelete, onViewScreenshot])

  return (
    <div className={TABLE_FRAME}>
      <DataTable
        error={error}
        onRetry={onRetry}
        announcement={bulkResult}
        label="Bug reports"
        rows={rows}
        columns={columns}
        rowKey={r => r.id}
        filters={FILTERS}
        searchPlaceholder="Search screen, description or version"
        pageSize={QUEUE_PAGE_SIZE}
        server={{ total }}
        defaultSort={APP_REPORTS_QUEUE.defaultSort}
        loading={loading}
        emptyTitle="No bug reports"
        emptyDescription="Bug reports that students send from the app, with their screenshots, show up here."
        selection={{
          selected,
          onChange: onSelectedChange,
          rowLabel: shortLabel,
          actions: <BulkStatusActions busy={bulkBusy} onApply={onBulk} />,
        }}
      />
    </div>
  )
}

// ── Main AppReportsManager ──────────────────────────────────────────────────

export function AppReportsManager() {
  const queue = useStatusQueue<AppBugReport>({
    listUrl: '/api/admin/app-reports',
    spec: APP_REPORTS_QUEUE,
    noun: { one: 'bug report', many: 'bug reports' },
    singular: 'Report',
  })
  const [lightbox, setLightbox] = useState<AppBugReport | null>(null)
  const [deleting, setDeleting] = useState<AppBugReport | null>(null)

  return (
    <PageBody intro="Bugs students reported from the app. Reproduce, fix, then mark them resolved.">
      <AppReportsView
        rows={queue.rows}
        total={queue.total}
        loading={queue.loading}
        error={queue.error}
        selected={queue.selected}
        onSelectedChange={queue.setSelected}
        bulkBusy={queue.bulkBusy}
        bulkResult={queue.bulkResult}
        onBulk={queue.applyBulk}
        onRetry={queue.reload}
        onViewScreenshot={setLightbox}
        onSetStatus={queue.setStatus}
        onDelete={setDeleting}
      />

      <ScreenshotLightbox report={lightbox} onClose={() => setLightbox(null)} />
      {deleting && (
        <ConfirmDialog
          message={`Delete the bug report for “${shortLabel(deleting)}”? This cannot be undone.`}
          confirmLabel="Delete report"
          onConfirm={async () => { if (await queue.remove(deleting.id)) setDeleting(null) }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </PageBody>
  )
}
