'use client'

import { useEffect, useState } from 'react'
import { Drawer } from '@/components/ui/Drawer'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { Icon } from '@/components/ui/Icon'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import type { PreviewFilter, PreviewItem, PreviewResult } from '@/lib/kb/previewKbFile'
import { notifyError } from '@/lib/toast'
import type { KbFileRow } from './types'

const PAGE = 25
const LETTERS = ['A', 'B', 'C', 'D']
async function fetchPreview(id: string, filter: PreviewFilter, offset: number): Promise<PreviewResult> {
  const res = await fetch(`/api/kb/preview?driveFileId=${encodeURIComponent(id)}&filter=${filter}&offset=${offset}&limit=${PAGE}`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `Couldn’t load the preview (${res.status})`)
  return body
}

const HOLD_LABEL = { missing_figure: 'Missing figure', few_options: 'Too few choices' } as const

const FILTERS: { id: PreviewFilter; label: (c: PreviewResult['counts']) => string }[] = [
  { id: 'all', label: c => `All drafts (${c.drafts})` },
  { id: 'ready', label: c => `Will publish (${c.ready})` },
  { id: 'held', label: c => `Held back (${c.missingFigure + c.fewOptions})` },
]

function QuestionCard({ q, n }: { q: PreviewItem; n: number }) {
  return (
    <li className="rounded-md border border-subtle bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ink-muted">
        <span className="font-medium tabular-nums text-ink">#{n}</span>
        {q.topic && <span>{q.topic}{q.subtopic ? ` · ${q.subtopic}` : ''}</span>}
        {q.difficulty && <span>· {q.difficulty}</span>}
        {q.hold && <Badge tone="warning" className="ml-auto">{HOLD_LABEL[q.hold]}</Badge>}
      </div>
      {q.passage_text && (
        <details className="mt-2 text-ui">
          <summary className="cursor-pointer font-medium text-maroon">Reading passage</summary>
          <p className="mt-1 whitespace-pre-line text-ink-muted">{q.passage_text}</p>
        </details>
      )}
      <p className="mt-2 whitespace-pre-line text-sm text-ink">{q.question_text}</p>
      {q.image_url && (
        // eslint-disable-next-line @next/next/no-img-element -- remote figure of unknown size
        <img src={q.image_url} alt={q.image_alt ?? 'Question figure'} loading="lazy" className="mt-2 max-h-48 rounded-sm border border-subtle" />
      )}
      <ol className="mt-2 space-y-1">
        {q.options.map((opt, i) => {
          const correct = i === q.correct_index
          return (
            <li key={i} className={`flex gap-2 rounded-sm px-2 py-1 text-ui ${correct ? 'bg-success-soft text-success-strong font-medium' : 'text-ink'}`}>
              <span className="w-4 flex-shrink-0 font-medium">{LETTERS[i]}.</span>
              <span className="min-w-0 flex-1">{opt}</span>
              {correct && <><Icon name="check" size={14} className="mt-0.5 flex-shrink-0" /><span className="sr-only">(correct answer)</span></>}
            </li>
          )
        })}
      </ol>
      {q.explanation && <p className="mt-2 text-xs text-ink-muted"><span className="font-medium text-ink">Why: </span>{q.explanation}</p>}
    </li>
  )
}

/**
 * Preview of one Drive file's drafts before Publish: every question as the app
 * will show it, the answer marked, and what Publish will hold back and why.
 */
export function PreviewDrawer({ file, onClose, onPublish, publishing }: {
  file: KbFileRow | null
  onClose: () => void
  onPublish: (f: KbFileRow) => void
  publishing: boolean
}) {
  const [filter, setFilter] = useState<PreviewFilter>('all')
  const [attempt, setAttempt] = useState(0)
  // The latest answer, tagged with the request it answers: while it doesn't
  // match the current file + filter, that request is still loading.
  const [page, setPage] = useState<{ key: string; data: PreviewResult | null; error: string | null } | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const fileId = file?.drive_file_id
  const key = `${fileId}|${filter}|${attempt}`

  // Mounted per file (keyed by the parent), so state starts empty for each one.
  useEffect(() => {
    if (!fileId) return
    let live = true
    fetchPreview(fileId, filter, 0).then(
      data => { if (live) setPage({ key, data, error: null }) },
      (err: Error) => { if (live) setPage({ key, data: null, error: err.message }) },
    )
    return () => { live = false }
  }, [fileId, filter, key])

  const current = page?.key === key ? page : null
  const data = current?.data ?? null
  const error = current?.error ?? null
  const loading = (!!fileId && !current) || loadingMore

  async function loadMore() {
    if (!fileId || !data) return
    setLoadingMore(true)
    try {
      const next = await fetchPreview(fileId, filter, data.items.length)
      setPage({ key, data: { ...next, items: [...data.items, ...next.items] }, error: null })
    } catch (err) {
      notifyError(err instanceof Error ? err : 'Couldn’t load more questions')
    } finally {
      setLoadingMore(false)
    }
  }

  const counts = data?.counts
  return (
    <Drawer
      open={!!file}
      onClose={onClose}
      width="xl"
      title={file ? `Preview · ${file.name}` : 'Preview'}
      description="Drafts from this file. Publishing makes the ready ones live in the app; held-back questions stay drafts."
      footer={close => (
        <>
          <Button variant="ghost" onClick={close}>Close</Button>
          {file && (
            <Button variant="primary" icon="upload" loading={publishing} disabled={!counts || counts.ready === 0} onClick={() => onPublish(file)}>
              {counts ? `Publish ${counts.ready} question${counts.ready === 1 ? '' : 's'}` : 'Publish'}
            </Button>
          )}
        </>
      )}
    >
      <div className="space-y-3">
        {counts && (
          <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
            {FILTERS.map(f => (
              <Button key={f.id} size="sm" variant={filter === f.id ? 'primary' : 'secondary'} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>
                {f.label(counts)}
              </Button>
            ))}
          </div>
        )}
        {counts && (counts.missingFigure > 0 || counts.fewOptions > 0) && (
          <p className="text-xs text-ink-muted">
            Held back: {[counts.missingFigure ? `${counts.missingFigure} need a figure that isn’t in Drive yet` : '', counts.fewOptions ? `${counts.fewOptions} have fewer than 2 choices or an answer key outside them` : ''].filter(Boolean).join(' · ')}.
            Duplicates of live questions are also skipped at publish.
          </p>
        )}
        {error && <ErrorBanner title="Couldn’t load the preview" message={error} action={<Button size="sm" onClick={() => setAttempt(n => n + 1)}>Try again</Button>} />}
        {data && data.items.length === 0 && !loading && <p className="py-8 text-center text-ui text-ink-muted">No questions in this view.</p>}
        {data && data.items.length > 0 && (
          <ol className="space-y-2" aria-label="Draft questions">
            {data.items.map((q, i) => <QuestionCard key={q.question_id} q={q} n={i + 1} />)}
          </ol>
        )}
        <p role="status" aria-live="polite" className="sr-only">{loading ? 'Loading questions' : data ? `Showing ${data.items.length} of ${data.total}` : ''}</p>
        {loading && <p className="flex items-center justify-center gap-2 py-4 text-ui text-ink-muted"><Icon name="loader" size={16} className="animate-spin" />Loading…</p>}
        {data && !loading && data.items.length < data.total && fileId && (
          <div className="flex justify-center">
            <Button size="sm" onClick={loadMore}>
              Show more ({data.total - data.items.length} left)
            </Button>
          </div>
        )}
      </div>
    </Drawer>
  )
}
