'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'

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

const STATUS: Record<KbDriveFile['status'], { label: string; cls: string }> = {
  imported:      { label: 'Imported',      cls: 'bg-success-soft text-success-strong' },
  needs_mapping: { label: 'Needs mapping', cls: 'bg-warning-soft text-warning-strong' },
  skipped:       { label: 'Skipped',       cls: 'bg-surface-3 text-ink-muted' },
  error:         { label: 'Error',         cls: 'bg-danger-soft text-danger-strong' },
}

const fmt = (iso: string) => new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })

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
        setNotice({ msg: parts.join(' · '), ok: s.errors.length === 0 })
        router.refresh()
      } catch (err) {
        setNotice({ msg: err instanceof Error ? err.message : 'Sync failed', ok: false })
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
      setNotice({
        msg: `${f.name}: published ${r.published}${held.length ? ` · held back ${held.join(', ')}` : ''}`,
        ok: true,
      })
      router.refresh()
    } catch (err) {
      setNotice({ msg: err instanceof Error ? err.message : 'Publish failed', ok: false })
    } finally {
      setPublishing(null)
    }
  }

  return (
    <div className="bg-white rounded-[16px] border border-black/[0.05] shadow-[0_2px_8px_rgba(0,0,0,0.06)] overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 border-b border-black/[0.05]">
        <div>
          <h2 className="font-heading font-bold text-[15px] text-ink">Question bank (Google Drive)</h2>
          <p className="text-[11px] text-ink-subtle">
            Syncs daily at 2:00 AM. New questions arrive as drafts — review, then publish each file.
          </p>
        </div>
        <button
          type="button"
          onClick={syncNow}
          disabled={syncing}
          aria-busy={syncing}
          className="rounded-[980px] px-4 py-1.5 text-[13px] font-medium bg-maroon text-white hover:bg-maroon-light transition-colors disabled:opacity-60 shadow-sm"
        >
          {syncing ? 'Syncing…' : 'Sync now'}
        </button>
      </div>

      <p role="status" aria-live="polite" className={notice ? `px-5 py-2 text-[12px] font-medium ${notice.ok ? 'text-success-strong' : 'text-danger-strong'}` : 'sr-only'}>
        {notice?.msg ?? ''}
      </p>

      {files.length === 0 ? (
        <p className="px-5 py-6 text-sm text-ink-subtle">
          Nothing synced yet. Share the Drive folder with the service account, set KB_DRIVE_FOLDER_ID, then click Sync now.
        </p>
      ) : (
        <ul>
          {files.map(f => {
            const s = STATUS[f.status]
            const canPublish = f.status === 'imported' && f.rows_imported > 0
            return (
              <li key={f.drive_file_id} className="flex flex-wrap items-start gap-3 px-5 py-3 border-b border-black/[0.04] last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-medium text-ink break-all">{f.name}</span>
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase ${s.cls}`}>{s.label}</span>
                  </div>
                  <p className="mt-0.5 text-[12px] text-ink-muted">
                    {f.status === 'imported' && (
                      <>
                        {f.rows_imported} questions
                        {f.rows_missing_media > 0 && (
                          <>
                            {' · '}<span className="text-warning-strong">{f.rows_missing_media} missing figures</span>
                            {' · '}
                            <a
                              href={`/api/kb/missing-figures?driveFileId=${encodeURIComponent(f.drive_file_id)}`}
                              className="text-maroon font-medium underline underline-offset-2 hover:no-underline"
                            >
                              Download list
                            </a>
                          </>
                        )}
                        {f.imported_at && <> · synced {fmt(f.imported_at)}</>}
                        {f.published_at && <> · Published {fmt(f.published_at)}</>}
                      </>
                    )}
                  </p>
                  {f.message && <p className="mt-0.5 text-[11px] text-ink-subtle break-words">{f.message}</p>}
                </div>
                {canPublish && (
                  <button
                    type="button"
                    onClick={() => publish(f)}
                    disabled={publishing !== null}
                    aria-busy={publishing === f.drive_file_id}
                    className="rounded-[980px] px-3 py-1 text-[12px] font-medium border border-maroon text-maroon hover:bg-maroon hover:text-white transition-colors disabled:opacity-60"
                  >
                    {publishing === f.drive_file_id ? 'Publishing…' : 'Publish drafts'}
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
