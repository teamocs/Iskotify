'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Field, controlClass } from '@/components/ui/Field'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { ConfirmDialog } from '../ConfirmDialog'
import { apiRequest } from '@/lib/apiRequest'
import { notifyError, notifySuccess } from '@/lib/toast'
import { CONTENT_TYPE_LABEL, DRIVE_CONTENT_TYPES, folderUrl, type DriveContentType, type DriveSourceRow } from '@/lib/driveSources/sources'
import { jsonInit } from './types'

interface Props {
  sources: DriveSourceRow[]
  /** KB_DRIVE_FOLDER_ID: always synced as questions, not editable here. */
  envFolderId: string | null
  /** The service account's client_email (server-side; never the key). */
  serviceAccountEmail: string | null
  /** drive_sources couldn't be read (e.g. migration 068 not applied yet). */
  loadError?: string
}

const TYPE_HINT: Record<DriveContentType, string> = {
  questions: 'CSV, Excel or Google Sheets of questions — previewed under Questions above.',
  listings: 'Google Sheets, CSV or Excel of exams and scholarships — one preview per file.',
  announcements: 'Weekly admissions report Google Docs — the AI reads each into announcements for you to review.',
}

function FolderLink({ id }: { id: string }) {
  return (
    <a href={folderUrl(id)} target="_blank" rel="noopener noreferrer" className="font-mono text-xs text-maroon underline underline-offset-2 hover:no-underline break-all">
      {id}<span className="sr-only"> (opens Google Drive)</span>
    </a>
  )
}

/**
 * Which Google Drive folders the sync reads, and as what. The daily sync and
 * "Sync now" read every enabled folder; each file lands in its type's preview.
 */
export function DriveSourcesPanel({ sources, envFolderId, serviceAccountEmail, loadError }: Props) {
  const router = useRouter()
  const [folder, setFolder] = useState('')
  const [contentType, setContentType] = useState<DriveContentType>('announcements')
  const [label, setLabel] = useState('')
  const [adding, setAdding] = useState(false)
  const [addError, setAddError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [removing, setRemoving] = useState<DriveSourceRow | null>(null)

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setAdding(true)
    setAddError(null)
    const r = await apiRequest<DriveSourceRow>('/api/admin/drive-sources', jsonInit('POST', { folder, contentType, label }))
    setAdding(false)
    if (!r.ok) {
      setAddError(r.error)
      notifyError(r.error)
      return
    }
    notifySuccess(`Folder added — it’s read on the next sync`)
    setFolder('')
    setLabel('')
    router.refresh()
  }

  async function toggle(s: DriveSourceRow) {
    setBusyId(s.id)
    const r = await apiRequest('/api/admin/drive-sources', jsonInit('PATCH', { id: s.id, enabled: !s.enabled }))
    setBusyId(null)
    if (!r.ok) return notifyError(r.error)
    notifySuccess(s.enabled ? 'Folder paused — the sync skips it' : 'Folder resumed')
    router.refresh()
  }

  async function remove(s: DriveSourceRow) {
    setBusyId(s.id)
    const r = await apiRequest(`/api/admin/drive-sources?id=${encodeURIComponent(s.id)}`, { method: 'DELETE' })
    setBusyId(null)
    setRemoving(null)
    if (!r.ok) return notifyError(r.error)
    notifySuccess('Folder removed — what it already synced stays')
    router.refresh()
  }

  async function copyEmail() {
    if (!serviceAccountEmail) return
    try {
      await navigator.clipboard.writeText(serviceAccountEmail)
      notifySuccess('Email copied')
    } catch {
      notifyError('Couldn’t copy — select the email and copy it by hand')
    }
  }

  return (
    <Card
      id="drive-sources"
      title="Drive sources"
      description="The Google Drive folders the sync reads, and what each holds. Every enabled folder is read daily and on Sync now."
      className="scroll-mt-16"
    >
      <div className="space-y-4">
        {serviceAccountEmail ? (
          <div className="flex flex-wrap items-center gap-2 rounded-sm bg-neutral-soft px-3 py-2 text-ui text-ink">
            <span>Share each folder with <code className="font-mono text-xs break-all">{serviceAccountEmail}</code> as Viewer.</span>
            <Button size="sm" variant="ghost" onClick={copyEmail}>Copy email</Button>
          </div>
        ) : (
          <p className="text-ui text-warning-strong">GOOGLE_SERVICE_ACCOUNT_JSON isn’t set, so the sync can’t read Drive.</p>
        )}

        {loadError ? (
          <ErrorBanner title="Couldn’t load the Drive sources" message={loadError} />
        ) : (
          <ul aria-label="Drive folders" className="divide-y divide-subtle rounded-sm border border-subtle">
            {envFolderId && (
              <li className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">Question bank</span>
                    <Badge tone="neutral">{CONTENT_TYPE_LABEL.questions}</Badge>
                  </span>
                  <FolderLink id={envFolderId} />
                </div>
                <span className="text-xs text-ink-muted">Set by KB_DRIVE_FOLDER_ID</span>
              </li>
            )}
            {sources.map(s => (
              <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2">
                <div className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{s.label || 'Untitled folder'}</span>
                    <Badge tone={s.content_type === 'announcements' ? 'info' : s.content_type === 'listings' ? 'brand' : 'neutral'}>{CONTENT_TYPE_LABEL[s.content_type]}</Badge>
                    {!s.enabled && <Badge tone="warning">Paused</Badge>}
                  </span>
                  <FolderLink id={s.folder_id} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="ghost" loading={busyId === s.id} disabled={busyId !== null} onClick={() => toggle(s)}>{s.enabled ? 'Pause' : 'Resume'}</Button>
                  <Button size="sm" variant="ghost" icon="trash" disabled={busyId !== null} onClick={() => setRemoving(s)}>
                    Remove<span className="sr-only"> {s.label || s.folder_id}</span>
                  </Button>
                </div>
              </li>
            ))}
            {!envFolderId && sources.length === 0 && (
              <li className="px-3 py-2 text-ui text-ink-muted">No folders yet — add one below.</li>
            )}
          </ul>
        )}

        <form onSubmit={add} className="space-y-3 border-t border-subtle pt-4" aria-label="Add a Drive folder">
          <h3 className="text-sm font-semibold text-ink">Add a folder</h3>
          <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
            <Field label="Drive folder link or id" required error={addError ?? undefined}>
              {p => (
                <input
                  {...p}
                  type="text"
                  inputMode="url"
                  value={folder}
                  onChange={e => setFolder(e.target.value)}
                  placeholder="https://drive.google.com/drive/folders/…"
                  className={controlClass}
                  autoComplete="off"
                />
              )}
            </Field>
            <Field label="Holds" hint={TYPE_HINT[contentType]}>
              {p => (
                <select {...p} value={contentType} onChange={e => setContentType(e.target.value as DriveContentType)} className={controlClass}>
                  {DRIVE_CONTENT_TYPES.map(t => <option key={t} value={t}>{CONTENT_TYPE_LABEL[t]}</option>)}
                </select>
              )}
            </Field>
          </div>
          <Field label="Name (optional)">
            {p => <input {...p} type="text" maxLength={80} value={label} onChange={e => setLabel(e.target.value)} placeholder="e.g. Weekly admissions reports" className={controlClass} />}
          </Field>
          <Button type="submit" variant="primary" icon="plus" loading={adding} disabled={!folder.trim()}>Add folder</Button>
        </form>
      </div>

      {removing && (
        <ConfirmDialog
          message={`Stop syncing “${removing.label || removing.folder_id}”? Previews and history already made from it stay.`}
          confirmLabel="Remove"
          onConfirm={() => remove(removing)}
          onCancel={() => setRemoving(null)}
        />
      )}
    </Card>
  )
}
