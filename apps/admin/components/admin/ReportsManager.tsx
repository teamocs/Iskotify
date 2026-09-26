'use client'

import { useEffect, useMemo, useState } from 'react'
import { notifySuccess, notifyError } from '@/lib/toast'
import { DataTable, type Column, type FilterDef } from '@/components/ui/DataTable'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { Drawer } from '@/components/ui/Drawer'
import { Field, controlClass } from '@/components/ui/Field'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { TABLE_FRAME } from '@/components/ui/Table'
import { PageBody } from '@/components/ui/Page'
import type { ReviewStatus } from '@/lib/admin/bulkStatus'
import { PRESET_REASONS, QUEUE_PAGE_SIZE, REPORTS_QUEUE } from '@/lib/admin/queueSpecs'
import { ConfirmDialog } from './ConfirmDialog'
import { BulkStatusActions, ClampText, QueueRowActions, StatusBadge, fmtDate, statusFilter, useStatusQueue } from './StatusQueue'

// ── Types ───────────────────────────────────────────────────────────────────

export interface QuestionReport {
  id: string
  question_id: string
  source_table: 'flashcards' | 'upcat_questions'
  question_text: string
  reason: string
  user_id: string | null
  status: ReviewStatus
  created_at: string
  updated_at: string
}

export interface FlashcardQuestion {
  id: string
  question: string | null
  answer: string | null
  explanation: string | null
}

export interface UpcatQuestion {
  question_id: string
  question_text: string
  options: string[]
  correct_index: number
  explanation: string
  status: string
}

const SOURCE_LABEL: Record<QuestionReport['source_table'], string> = { flashcards: 'Flashcard', upcat_questions: 'UPCAT' }

const FILTERS: FilterDef<QuestionReport>[] = [
  statusFilter<QuestionReport>(),
  {
    id: 'reason',
    label: 'Reason',
    allLabel: 'Any reason',
    options: [...PRESET_REASONS.map(r => ({ value: r, label: r })), { value: 'other', label: 'Other' }],
  },
  {
    id: 'source',
    label: 'Source',
    allLabel: 'All sources',
    options: [{ value: 'flashcards', label: 'Flashcard' }, { value: 'upcat_questions', label: 'UPCAT' }],
  },
]

const shortLabel = (r: QuestionReport) => {
  const t = (r.question_text || r.question_id).trim()
  return t.length > 60 ? `${t.slice(0, 60)}…` : t
}

// ── Question editor drawer ──────────────────────────────────────────────────

interface Values {
  question: string
  answer: string
  text: string
  options: string[]
  correct: number
  explanation: string
  visibility: 'published' | 'draft'
}

const EMPTY: Values = { question: '', answer: '', text: '', options: ['', '', '', ''], correct: 0, explanation: '', visibility: 'published' }

function valuesFrom(isUpcat: boolean, question: FlashcardQuestion | UpcatQuestion): Values {
  if (isUpcat) {
    const q = question as UpcatQuestion
    return {
      ...EMPTY,
      text: q.question_text ?? '',
      options: Array.isArray(q.options) && q.options.length >= 4 ? q.options : ['', '', '', ''],
      correct: typeof q.correct_index === 'number' ? q.correct_index : 0,
      explanation: q.explanation ?? '',
      visibility: q.status === 'draft' ? 'draft' : 'published',
    }
  }
  const q = question as FlashcardQuestion
  return { ...EMPTY, question: q.question ?? '', answer: q.answer ?? '', explanation: q.explanation ?? '' }
}

type Errors = Partial<Record<string, string>>

function validate(isUpcat: boolean, v: Values): Errors {
  const e: Errors = {}
  if (isUpcat) {
    if (!v.text.trim()) e.text = 'Enter the question text.'
    v.options.forEach((o, i) => { if (!o.trim()) e[`option${i}`] = `Enter option ${i + 1}.` })
    if (v.correct < 0 || v.correct >= v.options.length || v.correct > 3) e.correct = 'Pick one of the first 4 options as the correct answer.'
  } else {
    if (!v.question.trim()) e.question = 'Enter the question.'
    if (!v.answer.trim()) e.answer = 'Enter the answer.'
  }
  return e
}

interface EditorProps {
  report: QuestionReport
  onClose: () => void
  onResolved: () => void
  /**
   * The live question when the caller already has it: `null` means it no
   * longer exists. Left undefined, the drawer loads it from the report route.
   */
  initialQuestion?: FlashcardQuestion | UpcatQuestion | null
}

export function QuestionEditorDrawer({ report, onClose, onResolved, initialQuestion }: EditorProps) {
  const isUpcat = report.source_table === 'upcat_questions'
  const preloaded = initialQuestion !== undefined
  const start = initialQuestion ? valuesFrom(isUpcat, initialQuestion) : EMPTY
  const [loading, setLoading] = useState(!preloaded)
  const [missing, setMissing] = useState(initialQuestion === null)
  const [loadError, setLoadError] = useState('')
  const [serverError, setServerError] = useState('')
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [initial, setInitial] = useState<Values>(start)
  const [values, setValues] = useState<Values>(start)

  const dirty = !loading && !missing && JSON.stringify(values) !== JSON.stringify(initial)
  const set = <K extends keyof Values>(key: K, value: Values[K]) => setValues(v => ({ ...v, [key]: value }))

  useEffect(() => {
    if (preloaded) return
    let cancelled = false
    async function load() {
      try {
        const res = await fetch(`/api/admin/reports/${report.id}`)
        if (cancelled) return
        if (!res.ok) {
          const body = await res.json().catch(() => ({}))
          setLoadError(body.error ?? 'Failed to load question')
          setLoading(false)
          return
        }
        const { question } = await res.json()
        if (cancelled) return
        if (!question) {
          setMissing(true)
        } else {
          const v = valuesFrom(report.source_table === 'upcat_questions', question)
          setInitial(v)
          setValues(v)
        }
        setLoading(false)
      } catch {
        if (!cancelled) {
          setLoadError('Network error')
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [report.id, report.source_table, preloaded])

  async function handleSave() {
    if (loading || missing) return
    setServerError('')
    setSaved(false)
    const found = validate(isUpcat, values)
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setSaving(true)
    try {
      const res = isUpcat
        ? await fetch(`/api/upcat-questions/${encodeURIComponent(report.question_id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question_text: values.text,
              options: values.options,
              correct_index: values.correct,
              explanation: values.explanation,
              status: values.visibility,
            }),
          })
        : await fetch(`/api/flashcards/cards/${encodeURIComponent(report.question_id)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              question: values.question,
              answer: values.answer,
              explanation: values.explanation,
            }),
          })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const message = body.error ?? 'Save failed'
        setServerError(message)
        notifyError(message)
        return
      }
      setInitial(values)
      setSaved(true)
      notifySuccess('Question saved')
    } catch {
      setServerError('Network error')
      notifyError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteQuestion() {
    setServerError('')
    setSaving(true)
    try {
      const url = isUpcat
        ? `/api/upcat-questions/${encodeURIComponent(report.question_id)}`
        : `/api/flashcards/cards/${encodeURIComponent(report.question_id)}`
      const res = await fetch(url, { method: 'DELETE' })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const message = body.error ?? 'Delete failed'
        setServerError(message)
        notifyError(message)
        return
      }
      setMissing(true)
      setConfirmingDelete(false)
      setSaved(true)
      notifySuccess('Question deleted')
    } catch {
      setServerError('Network error')
      notifyError('Network error')
    } finally {
      setSaving(false)
    }
  }

  async function handleMarkResolved() {
    setServerError('')
    setSaving(true)
    try {
      const res = await fetch(`/api/admin/reports/${report.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'resolved' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        const message = body.error ?? 'Failed to mark resolved'
        setServerError(message)
        notifyError(message)
        return
      }
      notifySuccess('Report marked resolved')
      onResolved()
    } catch {
      setServerError('Network error')
      notifyError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const textarea = `${controlClass} h-auto py-2`

  return (
    <>
      <Drawer
        open
        onClose={onClose}
        width="lg"
        title="Edit question"
        description={<>{SOURCE_LABEL[report.source_table]} question <span className="font-mono">{report.question_id}</span></>}
        onSubmit={handleSave}
        dirty={dirty}
        footer={close => (
          <>
            {report.status !== 'resolved' && (
              <Button icon="check" onClick={handleMarkResolved} disabled={saving} className="mr-auto">Mark resolved</Button>
            )}
            <Button onClick={close}>Close</Button>
            <Button type="submit" variant="primary" loading={saving} disabled={loading || missing}>
              {saving ? 'Saving…' : 'Save question'}
            </Button>
          </>
        )}
      >
        <div className="space-y-4">
          <dl className="rounded-sm bg-surface-2 px-3 py-2">
            <dt className="text-xs font-medium text-ink-muted">Reported reason</dt>
            <dd className="text-ui text-ink">{report.reason || '—'}</dd>
          </dl>

          {loadError && <ErrorBanner title="Couldn’t load the question" message={loadError} />}
          {serverError && <ErrorBanner title="That didn’t work" message={serverError} />}
          {saved && (
            <p role="status" className="rounded-sm bg-success-soft px-3 py-2 text-ui text-success-strong">
              Saved. You can mark this report resolved when you’re done.
            </p>
          )}

          {loading ? (
            <p role="status" className="text-ui text-ink-muted">Loading question…</p>
          ) : missing ? (
            <p className="rounded-sm bg-warning-soft px-3 py-2 text-ui text-warning-strong">
              This question no longer exists. Snapshot at report time: “{report.question_text || '—'}”
            </p>
          ) : loadError ? null : isUpcat ? (
            <>
              <Field label="Question text" required error={errors.text}>
                {p => <textarea {...p} rows={3} value={values.text} onChange={e => set('text', e.target.value)} className={textarea} />}
              </Field>
              <fieldset className="space-y-2">
                <legend className="mb-1 text-ui font-medium text-ink">Correct answer</legend>
                <p className="text-xs text-ink-muted">Select the correct option. Every option needs text.</p>
                {values.options.map((opt, i) => (
                  <div key={i} className="flex items-end gap-2">
                    <input
                      type="radio"
                      name="correct-option"
                      checked={values.correct === i}
                      onChange={() => set('correct', i)}
                      disabled={i > 3}
                      aria-label={`Option ${i + 1} is correct`}
                      className="mb-2.5 h-4 w-4 shrink-0 accent-maroon"
                    />
                    <Field label={`Option ${i + 1}`} required error={errors[`option${i}`]} className="flex-1">
                      {p => (
                        <input
                          {...p}
                          type="text"
                          value={opt}
                          onChange={e => set('options', values.options.map((o, j) => (j === i ? e.target.value : o)))}
                          className={controlClass}
                        />
                      )}
                    </Field>
                  </div>
                ))}
                {errors.correct && <p role="alert" className="text-xs font-medium text-danger">{errors.correct}</p>}
              </fieldset>
              <Field label="Explanation">
                {p => <textarea {...p} rows={3} value={values.explanation} onChange={e => set('explanation', e.target.value)} className={textarea} />}
              </Field>
              <Field label="Visibility" hint="Drafts are hidden from students.">
                {p => (
                  <select {...p} value={values.visibility} onChange={e => set('visibility', e.target.value as Values['visibility'])} className={controlClass}>
                    <option value="published">Published</option>
                    <option value="draft">Draft</option>
                  </select>
                )}
              </Field>
            </>
          ) : (
            <>
              <Field label="Question" required error={errors.question}>
                {p => <textarea {...p} rows={3} value={values.question} onChange={e => set('question', e.target.value)} className={textarea} />}
              </Field>
              <Field label="Answer" required error={errors.answer}>
                {p => <textarea {...p} rows={2} value={values.answer} onChange={e => set('answer', e.target.value)} className={textarea} />}
              </Field>
              <Field label="Explanation">
                {p => <textarea {...p} rows={3} value={values.explanation} onChange={e => set('explanation', e.target.value)} className={textarea} />}
              </Field>
            </>
          )}

          {!loading && !missing && !loadError && (
            <div className="border-t border-subtle pt-3">
              <Button
                size="sm"
                variant="ghost"
                icon="trash"
                onClick={() => setConfirmingDelete(true)}
                disabled={saving}
                className="text-danger hover:bg-danger-soft hover:text-danger-strong"
              >
                Delete this question
              </Button>
            </div>
          )}
        </div>
      </Drawer>
      {confirmingDelete && (
        <ConfirmDialog
          message={`Delete this ${SOURCE_LABEL[report.source_table]} question permanently? Students will no longer see it.`}
          confirmLabel="Delete question"
          onConfirm={handleDeleteQuestion}
          onCancel={() => setConfirmingDelete(false)}
        />
      )}
    </>
  )
}

// ── Table ───────────────────────────────────────────────────────────────────

interface ViewProps {
  /** The current page, as the server returned it (already searched, filtered and sorted). */
  rows: QuestionReport[]
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
  onEdit: (r: QuestionReport) => void
  onSetStatus: (id: string, status: ReviewStatus) => void
  onDelete: (r: QuestionReport) => void
}

export function ReportsView({ rows, total, loading, error, selected, onSelectedChange, bulkBusy, bulkResult, onBulk, onRetry, onEdit, onSetStatus, onDelete }: ViewProps) {
  // Memoised so a selection change re-renders only the rows whose checkbox flipped.
  const columns = useMemo<Column<QuestionReport>[]>(() => [
    {
      id: 'question',
      header: 'Question',
      sortValue: r => r.question_text,
      searchValue: r => `${r.question_text} ${r.question_id}`,
      className: 'max-w-[22rem]',
      cell: r => (
        <>
          <button
            type="button"
            onClick={() => onEdit(r)}
            className="line-clamp-3 whitespace-pre-wrap break-words text-left font-medium text-ink underline-offset-2 hover:underline"
          >
            {r.question_text || '—'}
          </button>
          <span className="block font-mono text-xs text-ink-muted">{r.question_id}</span>
        </>
      ),
    },
    {
      id: 'source',
      header: 'Source',
      sortValue: r => SOURCE_LABEL[r.source_table],
      cell: r => <Badge tone={r.source_table === 'upcat_questions' ? 'info' : 'neutral'}>{SOURCE_LABEL[r.source_table] ?? r.source_table}</Badge>,
    },
    {
      id: 'reason',
      header: 'Reason',
      sortValue: r => r.reason,
      searchValue: r => r.reason ?? '',
      className: 'max-w-[16rem]',
      cell: r => <ClampText text={r.reason || '—'} max={100} />,
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
          deleteLabel="Delete report"
          extra={[{ label: 'Edit question', name: `Edit question: ${shortLabel(r)}`, icon: 'pencil', onSelect: () => onEdit(r) }]}
        />
      ),
    },
  ], [onSetStatus, onDelete, onEdit])

  return (
    <div className={TABLE_FRAME}>
      <DataTable
        error={error}
        onRetry={onRetry}
        errorTitle="Couldn’t load reported questions"
        announcement={bulkResult}
        label="Reported questions"
        rows={rows}
        columns={columns}
        rowKey={r => r.id}
        filters={FILTERS}
        searchPlaceholder="Search question, ID or reason"
        pageSize={QUEUE_PAGE_SIZE}
        server={{ total }}
        defaultSort={REPORTS_QUEUE.defaultSort}
        loading={loading}
        emptyTitle="No reported questions"
        emptyDescription="When a student reports a flashcard or UPCAT question from the app, it shows up here for review."
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

// ── Main ReportsManager ─────────────────────────────────────────────────────

export function ReportsManager() {
  const queue = useStatusQueue<QuestionReport>({
    listUrl: '/api/admin/reports',
    spec: REPORTS_QUEUE,
    noun: { one: 'report', many: 'reports' },
    singular: 'Report',
  })
  const [editing, setEditing] = useState<QuestionReport | null>(null)
  const [deleting, setDeleting] = useState<QuestionReport | null>(null)

  return (
    <PageBody intro="Questions students flagged from the app. Fix the question, then mark the report resolved.">
      <ReportsView
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
        onEdit={setEditing}
        onSetStatus={queue.setStatus}
        onDelete={setDeleting}
      />

      {editing && (
        <QuestionEditorDrawer
          report={editing}
          onClose={() => { setEditing(null); queue.reload() }}
          onResolved={() => { setEditing(null); queue.afterChange() }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          message={`Delete this report about “${shortLabel(deleting)}”? The question itself is not deleted.`}
          confirmLabel="Delete report"
          onConfirm={async () => { if (await queue.remove(deleting.id)) setDeleting(null) }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </PageBody>
  )
}
