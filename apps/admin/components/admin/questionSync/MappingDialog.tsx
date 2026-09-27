'use client'

import { useEffect, useState, type FormEvent } from 'react'
import { Dialog } from '@/components/ui/Dialog'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Field, controlClass } from '@/components/ui/Field'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { notifyError, notifySuccess } from '@/lib/toast'
import { KB_FIELDS, REQUIRED_FIELDS, type KbField, type KbMapping } from '@/lib/kb/mapping'
import { ALL_SUBTESTS, SKILL_CATEGORIES } from '@/lib/kb/fileRules'
import type { MappingContext } from '@/lib/kb/fileMapping'
import type { SyncSummary } from '@/lib/kb/syncDriveFolder'
import type { KbFileRow } from './types'

const LABEL: Record<KbField, string> = {
  id: 'Question number', question: 'Question', option_a: 'Choice A', option_b: 'Choice B', option_c: 'Choice C',
  option_d: 'Choice D', answer: 'Correct answer', explanation: 'Explanation', topic: 'Topic', subtopic: 'Subtopic',
  difficulty: 'Difficulty', figure_file: 'Figure file', figure_caption: 'Figure caption', has_figure: 'Has figure (yes/no)',
  stimulus_id: 'Passage group id', passage: 'Passage text', stimulus_title: 'Passage title',
}

async function send(url: string, init?: RequestInit) {
  const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Request failed (${res.status})`)
  return body
}

/**
 * Tell the sync how to read a file: which pool it feeds and which column holds
 * each question field. "Suggest with AI" prefills it; saving re-syncs the file
 * so its questions land in Preview as drafts.
 */
export function MappingDialog({ file, onClose, onSaved }: {
  file: KbFileRow | null
  onClose: () => void
  onSaved: () => void
}) {
  const [ctx, setCtx] = useState<MappingContext | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [subtest, setSubtest] = useState('')
  const [skill, setSkill] = useState('')
  const [columns, setColumns] = useState<Partial<Record<KbField, string>>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<'save' | 'suggest' | 'reset' | null>(null)
  const [dirty, setDirty] = useState(false)
  const fileId = file?.drive_file_id

  const apply = (m: Pick<KbMapping, 'subtest' | 'skillCategory' | 'columns'>) => {
    setSubtest(m.subtest)
    setSkill(m.skillCategory)
    setColumns(m.columns)
  }

  // Mounted per file (keyed by the parent), so state starts empty for each one.
  useEffect(() => {
    if (!fileId) return
    send(`/api/kb/mapping?driveFileId=${encodeURIComponent(fileId)}`)
      .then((c: MappingContext) => {
        setCtx(c)
        if (c.mapping) apply(c.mapping)
        else if (c.rulePool) setSubtest(c.rulePool.subtest)
      })
      .catch(err => setLoadError(err instanceof Error ? err.message : 'Couldn’t load the file'))
  }, [fileId])

  async function suggest() {
    if (!fileId) return
    setBusy('suggest'); setError(null)
    try {
      const { suggestion } = await send('/api/kb/mapping/suggest', { method: 'POST', body: JSON.stringify({ driveFileId: fileId }) })
      apply(suggestion)
      setDirty(true)
      notifySuccess('AI filled in the mapping — check it, then save')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'AI mapping failed'
      setError(msg); notifyError(msg)
    } finally { setBusy(null) }
  }

  function report(summary: SyncSummary, fallback: string) {
    const imported = summary.imported[0]
    if (imported) notifySuccess(`${imported.rows ?? 0} question${imported.rows === 1 ? '' : 's'} ready in Preview`)
    else notifyError(summary.needsMapping[0]?.message ?? summary.errors[0]?.message ?? fallback)
  }

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!fileId) return
    const missing = REQUIRED_FIELDS.filter(f => !columns[f])
    if (!subtest) { setError('Choose the question pool.'); return }
    if (missing.length) { setError(`Choose a column for: ${missing.map(f => LABEL[f]).join(', ')}.`); return }
    setBusy('save'); setError(null)
    try {
      const { summary } = await send('/api/kb/mapping', { method: 'POST', body: JSON.stringify({ driveFileId: fileId, subtest, skillCategory: skill, columns }) })
      report(summary, 'Saved, but the file still couldn’t be imported')
      setDirty(false)
      onSaved()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Saving the mapping failed'
      setError(msg); notifyError(msg)
    } finally { setBusy(null) }
  }

  async function reset() {
    if (!fileId) return
    setBusy('reset'); setError(null)
    try {
      const { summary } = await send(`/api/kb/mapping?driveFileId=${encodeURIComponent(fileId)}`, { method: 'DELETE' })
      report(summary, 'Mapping cleared')
      setDirty(false)
      onSaved()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Clearing the mapping failed'
      setError(msg); notifyError(msg)
    } finally { setBusy(null) }
  }

  const sample = ctx?.sampleRows[0]
  const headers = ctx?.headers ?? []
  const set = (f: KbField, v: string) => { setColumns(c => ({ ...c, [f]: v || undefined })); setDirty(true) }

  return (
    <Dialog
      open={!!file}
      onClose={onClose}
      size="xl"
      dirty={dirty}
      onSubmit={save}
      title={file ? `Map columns · ${file.name}` : 'Map columns'}
      description="Pick the column that holds each field. Saving re-reads the file; its questions arrive in Preview as drafts, so nothing goes live until you publish."
      footer={close => (
        <>
          {ctx?.mapping && (
            <Button variant="ghost" className="mr-auto" loading={busy === 'reset'} disabled={busy !== null} onClick={reset}>
              Forget this mapping
            </Button>
          )}
          <Button variant="ghost" onClick={close}>Cancel</Button>
          <Button icon="refresh" loading={busy === 'suggest'} disabled={!ctx || busy !== null || headers.length === 0} onClick={suggest}>Suggest with AI</Button>
          <Button type="submit" variant="primary" loading={busy === 'save'} disabled={!ctx || busy !== null || headers.length === 0}>Save and re-sync</Button>
        </>
      )}
    >
      {loadError && <ErrorBanner title="Couldn’t load this file" message={loadError} />}
      {!ctx && !loadError && <p className="py-6 text-center text-ui text-ink-muted">Loading the file’s columns…</p>}
      {ctx && headers.length === 0 && (
        <ErrorBanner title="No columns read yet" message="This file hasn’t been read successfully yet. Run Sync now, then map it." />
      )}
      {ctx && headers.length > 0 && (
        <div className="space-y-4">
          {ctx.mapping && (
            <p className="text-ui text-ink-muted">
              Current mapping: <Badge tone={ctx.mapping.source === 'ai' ? 'info' : 'neutral'}>{ctx.mapping.source === 'ai' ? 'Mapped by AI' : 'Mapped by an admin'}</Badge>
            </p>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Question pool" required hint={ctx.rulePool ? 'Set by the file name.' : 'The exam section these questions belong to.'}>
              {p => (
                <select {...p} className={controlClass} value={subtest} onChange={e => { setSubtest(e.target.value); setDirty(true) }}>
                  <option value="">Choose…</option>
                  {ALL_SUBTESTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </Field>
            <Field label="Skill category" hint="Optional. Leave on the pool default unless the whole file tests one skill.">
              {p => (
                <select {...p} className={controlClass} value={skill} onChange={e => { setSkill(e.target.value); setDirty(true) }}>
                  <option value="">Pool default</option>
                  {SKILL_CATEGORIES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
            </Field>
          </div>

          <fieldset>
            <legend className="text-ui font-medium text-ink">Columns</legend>
            <p className="text-xs text-ink-muted">Starred fields are required. The example comes from the file’s first row.</p>
            <div className="mt-2 grid gap-x-4 gap-y-3 sm:grid-cols-2">
              {KB_FIELDS.map(({ key }) => {
                const header = columns[key]
                const example = header && sample ? sample[header] : ''
                return (
                  <Field key={key} label={LABEL[key]} required={REQUIRED_FIELDS.includes(key)} hint={example ? <span className="line-clamp-1">e.g. {example}</span> : undefined}>
                    {p => (
                      <select {...p} className={controlClass} value={header ?? ''} onChange={e => set(key, e.target.value)}>
                        <option value="">— Not in this file —</option>
                        {headers.map(h => <option key={h} value={h}>{h}</option>)}
                      </select>
                    )}
                  </Field>
                )
              })}
            </div>
          </fieldset>
          {error && <p role="alert" className="text-ui font-medium text-danger">{error}</p>}
        </div>
      )}
    </Dialog>
  )
}
