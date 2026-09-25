'use client'

import { useState } from 'react'
import { DataTable, type Column, type FilterDef } from '@/components/ui/DataTable'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { Button, IconButton, buttonClass } from '@/components/ui/Button'
import { Dialog } from '@/components/ui/Dialog'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { Icon } from '@/components/ui/Icon'
import { PageBody } from '@/components/ui/Page'
import type { ReviewStatus } from '@/lib/admin/bulkStatus'
import { APP_REPORTS_QUEUE, QUEUE_PAGE_SIZE } from '@/lib/admin/queueSpecs'
import { ConfirmDialog } from './ConfirmDialog'
import { BulkStatusActions, ClampText, StatusBadge, fmtDate, statusFilter, useStatusQueue } from './StatusQueue'

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

export function ScreenshotLightbox({ report, onClose }: { report: AppBugReport | null; onClose: () => void }) {
  if (!report?.image_url) return null
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
          <a href={report.image_url!} target="_blank" rel="noopener noreferrer" className={buttonClass({ variant: 'ghost', className: 'mr-auto' })}>
            Open original <Icon name="arrow-right" />
            <span className="sr-only">(opens in a new tab)</span>
          </a>
          <Button onClick={close}>Close</Button>
        </>
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={report.image_url}
        alt={`Screenshot of the ${screen} screen attached to this bug report`}
        className="mx-auto max-h-[70vh] rounded-sm border border-subtle object-contain"
      />
    </Dialog>
  )
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
  if (error) {
    return (
      <ErrorBanner
        title="Couldn’t load bug reports"
        message={error}
        action={<Button size="sm" icon="refresh" onClick={onRetry}>Try again</Button>}
      />
    )
  }

  const columns: Column<AppBugReport>[] = [
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
      cell: r => r.image_url ? (
        <button
          type="button"
          onClick={() => onViewScreenshot(r)}
          aria-label={`View screenshot for ${shortLabel(r)} bug report`}
          className="block h-12 w-12 overflow-hidden rounded-sm border border-subtle bg-surface-2 hover:border-strong"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={r.image_url} alt="" className="h-full w-full object-cover" />
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
      cell: r => {
        const name = shortLabel(r)
        return (
          <span className="inline-flex items-center gap-1">
            {r.status !== 'reviewed' && (
              <Button size="sm" variant="ghost" aria-label={`Mark reviewed: ${name}`} onClick={() => onSetStatus(r.id, 'reviewed')}>Reviewed</Button>
            )}
            {r.status !== 'resolved' && (
              <Button size="sm" variant="ghost" aria-label={`Mark resolved: ${name}`} onClick={() => onSetStatus(r.id, 'resolved')}>Resolved</Button>
            )}
            <IconButton icon="trash" label={`Delete bug report: ${name}`} onClick={() => onDelete(r)} className="hover:bg-danger-soft hover:text-danger-strong" />
          </span>
        )
      },
    },
  ]

  return (
    <div className="overflow-hidden rounded-md border border-subtle bg-surface">
      <DataTable
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
