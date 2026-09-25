'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { notifySuccess, notifyError } from '@/lib/toast'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Badge, type BadgeTone } from '@/components/ui/Badge'
import { DataTable, type Column, type FilterDef } from '@/components/ui/DataTable'

// One row of the kb_drive_files ledger (supabase/migrations/055).
export interface KbDriveFile {
  drive_file_id: string
  name: string
  path: string
  status: 'imported' | 'needs_mapping' | 'skipped' | 'error'
  dialect: string | null
  rows_total: number
  rows_imported: number
  rows_missing_media: number
  rows_drafted: number
  message: string | null
  imported_at: string | null
  published_at: string | null
  updated_at: string
}

const STATUS: Record<KbDriveFile['status'], { label: string; tone: BadgeTone }> = {
  imported:      { label: 'Imported',      tone: 'success' },
  needs_mapping: { label: 'Needs mapping', tone: 'warning' },
  skipped:       { label: 'Skipped',       tone: 'neutral' },
  error:         { label: 'Error',         tone: 'danger' },
}

const STATUS_FILTER: FilterDef<KbDriveFile> = {
  id: 'status',
  label: 'Status',
  options: Object.entries(STATUS).map(([value, s]) => ({ value, label: s.label })),
  predicate: (f, v) => f.status === v,
}

const fmt = (iso: string) => new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })
const dateSort = (iso: string | null) => (iso ? new Date(iso) : null)

export function KbDriveSyncPanel({ files }: { files: KbDriveFile[] }) {
  const router = useRouter()
  const [syncing, startSync] = useTransition()
  const [publishing, setPublishing] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ msg: string; ok: boolean } | null>(null)

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

  function syncNow() {
    startSync(async () => {
      try {
        const s = await post('/api/kb/drive-sync')
        const parts = [
          `${s.imported.length} imported`,
          `${s.unchanged} unchanged`,
          s.needsMapping.length ? `${s.needsMapping.length} need mapping` : '',
          s.errors.length ? `${s.errors.length} failed` : '',
          s.remaining ? `${s.remaining} left for the next run` : '',
        ].filter(Boolean)
        const msg = parts.join(' · ')
        setNotice({ msg, ok: s.errors.length === 0 })
        // The persistent summary line above carries the breakdown; the toast
        // is only the action-level headline, so the text isn't shown twice.
        if (s.errors.length === 0) notifySuccess('Drive sync complete')
        else notifyError(`Drive sync finished with ${s.errors.length} failed file(s)`)
        router.refresh()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Sync failed'
        setNotice({ msg, ok: false })
        notifyError(msg)
      }
    })
  }

  async function publish(f: KbDriveFile) {
    setPublishing(f.drive_file_id)
    try {
      const r = await post('/api/kb/publish', { driveFileId: f.drive_file_id })
      const held = [
        r.skippedMissingMedia ? `${r.skippedMissingMedia} missing a figure` : '',
        r.skippedFewOptions ? `${r.skippedFewOptions} with 3 options` : '',
        r.skippedDuplicate ? `${r.skippedDuplicate} duplicates` : '',
      ].filter(Boolean)
      const msg = `${f.name}: published ${r.published}${held.length ? ` · held back ${held.join(', ')}` : ''}`
      setNotice({ msg, ok: true })
      notifySuccess(`Published ${r.published} question${r.published === 1 ? '' : 's'}`)
      router.refresh()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Publish failed'
      setNotice({ msg, ok: false })
      notifyError(msg)
    } finally {
      setPublishing(null)
    }
  }

  const columns: Column<KbDriveFile>[] = [
    {
      id: 'name',
      header: 'File',
      sortValue: f => f.name,
      searchValue: f => `${f.name} ${f.path} ${f.message ?? ''}`,
      cell: f => (
        <div className="min-w-[14rem] max-w-md">
          <span className="block font-medium text-ink break-all">{f.name}</span>
          {f.message && <span className="block text-xs text-ink-muted break-words">{f.message}</span>}
        </div>
      ),
    },
    { id: 'status', header: 'Status', sortValue: f => STATUS[f.status].label, cell: f => <Badge tone={STATUS[f.status].tone}>{STATUS[f.status].label}</Badge> },
    { id: 'questions', header: 'Questions', align: 'right', sortValue: f => f.rows_imported, cell: f => (f.status === 'imported' ? f.rows_imported : '—') },
    {
      id: 'missing',
      header: 'Missing figures',
      sortValue: f => f.rows_missing_media,
      cell: f =>
        f.status === 'imported' && f.rows_missing_media > 0 ? (
          <span className="whitespace-nowrap">
            <span className="font-medium text-warning-strong">{f.rows_missing_media} missing</span>
            {' · '}
            <a
              href={`/api/kb/missing-figures?driveFileId=${encodeURIComponent(f.drive_file_id)}`}
              className="font-medium text-maroon underline underline-offset-2 hover:no-underline"
            >
              Download list
            </a>
          </span>
        ) : (
          <span className="text-ink-muted">—</span>
        ),
    },
    { id: 'synced', header: 'Last synced', sortValue: f => dateSort(f.imported_at), cell: f => <span className="whitespace-nowrap text-ink-muted">{f.imported_at ? fmt(f.imported_at) : '—'}</span> },
    { id: 'published', header: 'Published', sortValue: f => dateSort(f.published_at), cell: f => <span className="whitespace-nowrap text-ink-muted">{f.published_at ? `Published ${fmt(f.published_at)}` : 'Not yet'}</span> },
    {
      id: 'actions',
      header: 'Actions',
      hideHeader: true,
      align: 'right',
      cell: f =>
        f.status === 'imported' && f.rows_imported > 0 ? (
          <Button size="sm" loading={publishing === f.drive_file_id} disabled={publishing !== null} onClick={() => publish(f)}>
            {publishing === f.drive_file_id ? 'Publishing…' : 'Publish drafts'}
          </Button>
        ) : null,
    },
  ]

  return (
    <Card
      id="drive-question-bank"
      title="Drive question bank"
      description="Syncs daily at 2:00 AM. New questions arrive as drafts — review, then publish each file."
      actions={<Button variant="primary" size="sm" icon="refresh" loading={syncing} onClick={syncNow}>{syncing ? 'Syncing…' : 'Sync now'}</Button>}
      flush
      className="scroll-mt-16"
    >
      <p role="status" aria-live="polite" className={notice ? `px-4 py-2 text-ui font-medium border-b border-subtle ${notice.ok ? 'text-success-strong' : 'text-danger-strong'}` : 'sr-only'}>
        {notice?.msg ?? ''}
      </p>
      <DataTable
        label="Drive files"
        rows={files}
        columns={columns}
        rowKey={f => f.drive_file_id}
        filters={[STATUS_FILTER]}
        paramPrefix="kb_"
        searchPlaceholder="Search file names"
        emptyTitle="Nothing synced yet"
        emptyDescription="Share the Drive folder with the service account, set KB_DRIVE_FOLDER_ID, then click Sync now."
      />
    </Card>
  )
}
