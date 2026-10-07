'use client'

import { useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { DataTable, type Column } from '@/components/ui/DataTable'
import { notifyError, notifySuccess } from '@/lib/toast'
import { splitStages, poolOf, draftReadiness } from '@/lib/kb/syncStages'
import { describeContentSync } from '@/lib/driveContent/describe'
import { PreviewDrawer } from './PreviewDrawer'
import { MappingDialog } from './MappingDialog'
import { fmtDateTime, type KbFileRow, type PublishEventRow, type SyncRunRow } from './types'

async function post(url: string, body?: unknown) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`)
  return data
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

const RUN_STATUS: Record<SyncRunRow['status'], { label: string; tone: BadgeTone }> = {
  running: { label: 'Running', tone: 'info' },
  ok: { label: 'OK', tone: 'success' },
  warn: { label: 'Needs attention', tone: 'warning' },
  error: { label: 'Failed', tone: 'danger' },
}

function FileName({ f }: { f: KbFileRow }) {
  const pool = poolOf(f.name, f.mapped_subtest)
  return (
    <div className="min-w-[14rem] max-w-md">
      <span className="block font-medium text-ink break-all">{f.name}</span>
      <span className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-ink-muted">
        {pool && <span>{pool}</span>}
        {f.mapping_source === 'ai' && <Badge tone="info">Mapped by AI</Badge>}
        {f.mapping_source === 'admin' && <Badge tone="neutral">Custom mapping</Badge>}
      </span>
    </div>
  )
}

/** A stage of the flow, as a jump link with its count. */
function StageLink({ href, label, count, tone }: { href: string; label: string; count: number; tone: BadgeTone }) {
  return (
    <a href={href} className="flex min-w-0 flex-1 items-center justify-between gap-3 rounded-md border border-subtle bg-surface px-4 py-3 hover:border-ink-muted focus-visible:outline-2">
      <span className="text-ui font-medium text-ink">{label}</span>
      <Badge tone={count > 0 ? tone : 'neutral'}>{count}</Badge>
    </a>
  )
}

export function QuestionSyncView({ files, runs, events }: { files: KbFileRow[]; runs: SyncRunRow[]; events: PublishEventRow[] }) {
  const router = useRouter()
  const [syncing, startSync] = useTransition()
  const [publishing, setPublishing] = useState<string | null>(null)
  const [publishingAll, setPublishingAll] = useState(false)
  const [previewing, setPreviewing] = useState<KbFileRow | null>(null)
  const [mapping, setMapping] = useState<KbFileRow | null>(null)
  const [historyView, setHistoryView] = useState<'files' | 'runs'>('files')
  const [status, setStatus] = useState('')

  const stages = useMemo(() => splitStages(files), [files])
  const lastEvent = useMemo(() => {
    const m = new Map<string, PublishEventRow>()
    for (const e of events) if (!m.has(e.drive_file_id)) m.set(e.drive_file_id, e) // newest first
    return m
  }, [events])
  const lastRun = runs[0]
  const draftTotal = stages.preview.reduce((n, f) => n + f.rows_drafted, 0)

  function syncNow() {
    startSync(async () => {
      try {
        const s = await post('/api/kb/drive-sync')
        const parts = [
          `${s.imported.length} imported`,
          s.aiMapped ? `${s.aiMapped} mapped by AI` : '',
          s.needsMapping.length ? `${s.needsMapping.length} need mapping` : '',
          s.errors.length ? `${s.errors.length} failed` : '',
          s.remaining ? `${s.remaining} left for the next run` : '',
        ].filter(Boolean).join(' · ')
        // Listings and announcements folders (Drive sources), when there are any.
        const content = describeContentSync(s.content)
        setStatus(`Sync finished: ${parts}${content.text ? ` · ${content.text}` : ''}`)
        if (s.errors.length) notifyError(`Drive sync finished with ${plural(s.errors.length, 'failed file')}`)
        else if (content.problems) notifyError(`Drive sync finished — ${content.text}`)
        else notifySuccess(s.imported.length ? `Drive sync complete — ${plural(s.imported.length, 'file')} ready to preview` : content.text ? `Drive sync complete — ${content.text}` : 'Drive sync complete — nothing new')
        router.refresh()
      } catch (err) {
        notifyError(err instanceof Error ? err : 'Drive sync failed')
      }
    })
  }

  async function publishOne(f: KbFileRow): Promise<boolean> {
    setPublishing(f.drive_file_id)
    try {
      const r = await post('/api/kb/publish', { driveFileId: f.drive_file_id })
      const held = r.skippedMissingMedia + r.skippedFewOptions + r.skippedDuplicate
      notifySuccess(`${f.name}: published ${plural(r.published, 'question')}${held ? ` · ${held} held back` : ''}`)
      return true
    } catch (err) {
      notifyError(err instanceof Error ? `${f.name}: ${err.message}` : 'Publish failed')
      return false
    } finally {
      setPublishing(null)
    }
  }

  async function publish(f: KbFileRow) {
    if (await publishOne(f)) {
      setPreviewing(null)
      router.refresh()
    }
  }

  async function publishAll() {
    setPublishingAll(true)
    let ok = 0
    for (const f of stages.preview) if (await publishOne(f)) ok++
    setPublishingAll(false)
    setStatus(`Published ${ok} of ${plural(stages.preview.length, 'file')}`)
    router.refresh()
  }

  const busy = publishing !== null || publishingAll

  const previewColumns: Column<KbFileRow>[] = [
    { id: 'name', header: 'File', sortValue: f => f.name, searchValue: f => `${f.name} ${f.path}`, cell: f => <FileName f={f} /> },
    {
      id: 'drafts', header: 'Ready to publish', sortValue: f => draftReadiness(f).ready,
      cell: f => {
        const { ready, heldMissingFigure } = draftReadiness(f)
        return (
          <span className="whitespace-nowrap text-ui">
            <span className="font-medium text-ink">{ready} ready</span>
            {heldMissingFigure > 0 && <span className="block text-xs text-warning-strong">{heldMissingFigure} held: need a figure</span>}
          </span>
        )
      },
    },
    {
      id: 'missing', header: 'Missing figures', sortValue: f => f.rows_missing_media,
      cell: f => f.rows_missing_media > 0 ? (
        <span className="whitespace-nowrap">
          <span className="font-medium text-warning-strong">{f.rows_missing_media}</span>{' · '}
          <a href={`/api/kb/missing-figures?driveFileId=${encodeURIComponent(f.drive_file_id)}`} className="font-medium text-maroon underline underline-offset-2 hover:no-underline">
            List<span className="sr-only"> of missing figures for {f.name}</span>
          </a>
        </span>
      ) : <span className="text-ink-muted">—</span>,
    },
    { id: 'rejected', header: 'Rows skipped', numeric: true, hideOnMobile: true, sortValue: f => f.rows_rejected, cell: f => (f.rows_rejected ? <span title={f.message ?? undefined}>{f.rows_rejected}</span> : '—') },
    { id: 'synced', header: 'Synced', hideOnMobile: true, sortValue: f => (f.imported_at ? new Date(f.imported_at) : null), cell: f => <span className="whitespace-nowrap text-ink-muted">{f.imported_at ? fmtDateTime(f.imported_at) : '—'}</span> },
    {
      id: 'actions', header: 'Actions', hideHeader: true, align: 'right',
      cell: f => (
        <div className="flex justify-end gap-2">
          {f.mapping_source && f.mapping_source !== 'rule' && (
            <Button size="sm" variant="ghost" disabled={busy} onClick={() => setMapping(f)}>Edit mapping</Button>
          )}
          <Button size="sm" onClick={() => setPreviewing(f)}>Preview</Button>
          <Button size="sm" variant="primary" loading={publishing === f.drive_file_id} disabled={busy} onClick={() => publish(f)}>Publish</Button>
        </div>
      ),
    },
  ]

  const attentionColumns: Column<KbFileRow>[] = [
    { id: 'name', header: 'File', sortValue: f => f.name, searchValue: f => `${f.name} ${f.message ?? ''}`, cell: f => <FileName f={f} /> },
    {
      id: 'why', header: 'What’s wrong',
      cell: f => (
        <div className="min-w-[16rem] max-w-lg">
          <Badge tone={f.status === 'error' ? 'danger' : 'warning'}>{f.status === 'error' ? 'Sync failed' : 'Needs mapping'}</Badge>
          {f.message && <p className="mt-1 text-xs text-ink-muted break-words">{f.message}</p>}
        </div>
      ),
    },
    {
      id: 'actions', header: 'Actions', hideHeader: true, align: 'right',
      cell: f => (f.headers?.length ?? 0) > 0
        ? <Button size="sm" variant="primary" onClick={() => setMapping(f)}>Map columns</Button>
        : <span className="text-xs text-ink-muted">Fix in Drive, then Sync now</span>,
    },
  ]

  const historyColumns: Column<KbFileRow>[] = [
    { id: 'name', header: 'File', sortValue: f => f.name, searchValue: f => f.name, cell: f => <FileName f={f} /> },
    { id: 'questions', header: 'Questions', numeric: true, sortValue: f => f.rows_imported, cell: f => f.rows_imported },
    {
      id: 'result', header: 'Last publish',
      cell: f => {
        const e = lastEvent.get(f.drive_file_id)
        if (!e) return <span className="text-ink-muted">{f.rows_drafted === 0 ? 'Nothing new to review' : '—'}</span>
        const held = [
          e.held_missing_media ? `${e.held_missing_media} missing a figure` : '',
          e.held_few_options ? `${e.held_few_options} with too few choices` : '',
          e.held_duplicate ? `${e.held_duplicate} duplicates` : '',
        ].filter(Boolean)
        return (
          <span className="text-ui">
            {plural(e.published, 'question')} published
            {held.length > 0 && <span className="block text-xs text-ink-muted">Held back: {held.join(', ')}</span>}
          </span>
        )
      },
    },
    { id: 'published', header: 'Published', sortValue: f => (f.published_at ? new Date(f.published_at) : null), cell: f => <span className="whitespace-nowrap text-ink-muted">{f.published_at ? fmtDateTime(f.published_at) : '—'}</span> },
    {
      id: 'actions', header: 'Actions', hideHeader: true, align: 'right',
      cell: f => {
        const e = lastEvent.get(f.drive_file_id)
        const held = e ? e.held_missing_media + e.held_few_options + e.held_duplicate : 0
        return (
          <div className="flex items-center justify-end gap-3">
            {f.rows_missing_media > 0 && (
              <a href={`/api/kb/missing-figures?driveFileId=${encodeURIComponent(f.drive_file_id)}`} className="text-ui font-medium text-maroon underline underline-offset-2 hover:no-underline whitespace-nowrap">
                {f.rows_missing_media} missing figures
              </a>
            )}
            {/* Held-back questions stay drafts; they remain reviewable after the file moves here. */}
            {held > 0 && <Button size="sm" onClick={() => setPreviewing(f)}>Review held back</Button>}
          </div>
        )
      },
    },
  ]

  const runColumns: Column<SyncRunRow>[] = [
    { id: 'when', header: 'Started', sortValue: r => new Date(r.started_at), cell: r => <span className="whitespace-nowrap">{fmtDateTime(r.started_at)}</span> },
    { id: 'trigger', header: 'By', cell: r => (r.trigger === 'cron' ? 'Daily schedule' : 'Sync now') },
    { id: 'status', header: 'Result', cell: r => <Badge tone={RUN_STATUS[r.status].tone}>{RUN_STATUS[r.status].label}</Badge> },
    {
      id: 'counts', header: 'Files',
      cell: r => (
        <span className="text-ui">
          {[`${r.imported} imported`, `${r.unchanged} unchanged`, r.ai_mapped ? `${r.ai_mapped} AI-mapped` : '', r.needs_mapping ? `${r.needs_mapping} need mapping` : '', r.errors ? `${r.errors} failed` : '', r.remaining ? `${r.remaining} deferred` : ''].filter(Boolean).join(' · ')}
          {r.message && <span className="block text-xs text-ink-muted break-words">{r.message}</span>}
        </span>
      ),
    },
  ]

  return (
    <>
      <section aria-label="Sync status" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-ui text-ink-muted">
            {lastRun
              ? <>Last sync {fmtDateTime(lastRun.started_at)} · <Badge tone={RUN_STATUS[lastRun.status].tone}>{RUN_STATUS[lastRun.status].label}</Badge></>
              : 'Syncs every day at 2:00 AM.'}
          </p>
          <Button variant="primary" icon="refresh" loading={syncing} disabled={busy} onClick={syncNow}>{syncing ? 'Syncing…' : 'Sync now'}</Button>
        </div>
        <nav aria-label="Sync stages" className="flex flex-col gap-2 sm:flex-row">
          <StageLink href="#needs-attention" label="Needs attention" count={stages.attention.length} tone="warning" />
          <StageLink href="#preview" label="Ready to publish" count={stages.preview.length} tone="brand" />
          <StageLink href="#history" label="Published" count={stages.history.length} tone="success" />
        </nav>
        <p role="status" aria-live="polite" className={status ? 'text-ui font-medium text-ink' : 'sr-only'}>{status}</p>
      </section>

      {(stages.attention.length > 0 || stages.ignored.length > 0) && (
        <Card
          id="needs-attention"
          title="Needs attention"
          description="Files the sync couldn’t read on its own. Map their columns (AI can suggest a mapping) and they move to Preview."
          flush
          className="scroll-mt-16"
        >
          {stages.attention.length > 0 ? (
            <DataTable label="Files needing attention" rows={stages.attention} columns={attentionColumns} rowKey={f => f.drive_file_id} paramPrefix="att_" searchable={false} />
          ) : (
            <p className="px-4 py-3 text-ui text-ink-muted">Nothing to fix — every readable file was imported.</p>
          )}
          {stages.ignored.length > 0 && (
            <details className="border-t border-subtle px-4 py-3">
              <summary className="cursor-pointer text-ui font-medium text-ink">Not imported ({stages.ignored.length})</summary>
              <ul className="mt-2 space-y-2">
                {stages.ignored.map(f => (
                  <li key={f.drive_file_id} className="text-ui">
                    <span className="font-medium text-ink break-all">{f.name}</span>
                    {f.message && <span className="block text-xs text-ink-muted">{f.message}</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      )}

      <Card
        id="preview"
        title="Preview"
        description={stages.preview.length
          ? `${plural(draftTotal, 'draft question')} across ${plural(stages.preview.length, 'file')}. Preview a file, then publish it — it moves to History.`
          : 'New and changed questions from Drive wait here as drafts until you publish them.'}
        actions={stages.preview.length > 1 ? (
          <Button size="sm" variant="primary" icon="upload" loading={publishingAll} disabled={busy} onClick={publishAll}>
            Publish all ({stages.preview.length})
          </Button>
        ) : undefined}
        flush
        className="scroll-mt-16"
      >
        {stages.preview.length > 0 ? (
          <DataTable label="Files ready to publish" rows={stages.preview} columns={previewColumns} rowKey={f => f.drive_file_id} paramPrefix="pre_" searchPlaceholder="Search files" />
        ) : (
          <EmptyState icon="check" title="Nothing waiting to publish" description="When a sync imports new or changed questions, the files show up here for review." />
        )}
      </Card>

      <Card
        id="history"
        title="History"
        description={historyView === 'files' ? 'Files whose questions are live. A file returns to Preview when its sheet changes.' : 'Every sync, from the daily schedule and from Sync now.'}
        actions={
          <div role="group" aria-label="History view" className="flex gap-1">
            <Button size="sm" variant={historyView === 'files' ? 'primary' : 'ghost'} aria-pressed={historyView === 'files'} onClick={() => setHistoryView('files')}>Published files</Button>
            <Button size="sm" variant={historyView === 'runs' ? 'primary' : 'ghost'} aria-pressed={historyView === 'runs'} onClick={() => setHistoryView('runs')}>Sync runs</Button>
          </div>
        }
        flush
        className="scroll-mt-16"
      >
        {historyView === 'files' ? (
          <DataTable
            label="Published files"
            rows={stages.history}
            columns={historyColumns}
            rowKey={f => f.drive_file_id}
            paramPrefix="his_"
            searchPlaceholder="Search files"
            emptyTitle="Nothing published yet"
            emptyDescription="Files you publish from Preview are listed here."
          />
        ) : (
          <DataTable
            label="Sync runs"
            rows={runs}
            columns={runColumns}
            rowKey={r => String(r.id)}
            paramPrefix="run_"
            searchable={false}
            emptyTitle="No sync runs recorded yet"
            emptyDescription="Runs are recorded from the next daily sync or Sync now."
          />
        )}
      </Card>

      <PreviewDrawer key={previewing?.drive_file_id ?? 'none'} file={previewing} onClose={() => setPreviewing(null)} onPublish={publish} publishing={publishing !== null} />
      <MappingDialog key={mapping?.drive_file_id ?? 'none'} file={mapping} onClose={() => setMapping(null)} onSaved={() => { setMapping(null); router.refresh() }} />
    </>
  )
}
