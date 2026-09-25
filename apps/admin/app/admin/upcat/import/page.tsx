'use client'
import { useMemo, useState } from 'react'
import Papa from 'papaparse'
import { Topbar } from '@/components/admin/Topbar'
import { GenerateExplanationsButton } from '@/components/admin/GenerateExplanationsButton'
import { CsvDropzone } from '@/components/flashcards/CsvDropzone'
import { QuestionBankEditorTable, type DisplayRow } from '@/components/flashcards/QuestionBankEditorTable'
import { normalizeQuestionBankHeader } from '@/lib/csv/questionBankHeaders'
import { cleanImportedText } from '@/lib/csv/cleaners'
import { VALID_SUBTESTS } from '@/lib/upcat/importUpcatCore'
import { validateAllQbRows, EXPECTED_COLUMNS, normalizeAnswerLetter } from '@/lib/upcat/validateQuestionBank'
import { notifySuccess, notifyError } from '@/lib/toast'
import { PageBody } from '@/components/ui/Page'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { controlClass } from '@/components/ui/Field'
import { Icon } from '@/components/ui/Icon'

type Row = Record<string, string>
const PAGE_SIZE = 25
const SERVER_ROW_CAP = 2000

export default function QuestionBankImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ passages: number; questions: number } | null>(null)
  const [projecting, setProjecting] = useState(false)
  const [projection, setProjection] = useState<{ subjects: number; topics: number; cards: number } | null>(null)

  const [showOnlyErrors, setShowOnlyErrors] = useState(true)
  const [page, setPage] = useState(0)
  const [bulkSubtest, setBulkSubtest] = useState('')

  const errorsByRow = useMemo(() => validateAllQbRows(rows), [rows])
  const errorRowCount = errorsByRow.size
  const validCount = rows.length - errorRowCount

  const displayedAll: DisplayRow[] = useMemo(() => {
    const out: DisplayRow[] = []
    rows.forEach((row, index) => {
      if (showOnlyErrors && !errorsByRow.has(index)) return
      out.push({ index, row })
    })
    return out
  }, [rows, errorsByRow, showOnlyErrors])

  const pageCount = Math.max(1, Math.ceil(displayedAll.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const pageRows = displayedAll.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)

  function handleFile(f: File) {
    setFile(f); setError(null); setResult(null); setProjection(null); setPage(0)
    if (f.size > 5 * 1024 * 1024) { setError('File too large (max 5MB)'); return }
    f.text().then(text => {
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: normalizeQuestionBankHeader })
      const all = (parsed.data as Row[])
        .map(r => {
          const clean: Row = {}
          for (const k of Object.keys(r)) clean[k] = cleanImportedText(r[k])
          // Canonicalize the answer to A–D so the dropdown reflects it and the
          // server's letterToIndex (A–D only) never throws on a "1"/"2" answer.
          if (clean.correct_answer) clean.correct_answer = normalizeAnswerLetter(clean.correct_answer) ?? clean.correct_answer
          return clean
        })
        .filter(r => Object.values(r).some(v => v.trim() !== ''))
      setRows(all)
      setShowOnlyErrors(validateAllQbRows(all).size > 0)
    }).catch(e => setError(e?.message ?? 'Could not read file'))
  }

  function updateCell(index: number, field: string, value: string) {
    setRows(prev => {
      const next = prev.slice()
      next[index] = { ...next[index], [field]: value }
      return next
    })
  }

  function applyBulkSubtest() {
    if (!bulkSubtest) return
    setRows(prev => prev.map(r => {
      const st = (r.subtest ?? '').trim()
      return (VALID_SUBTESTS as readonly string[]).includes(st) ? r : { ...r, subtest: bulkSubtest }
    }))
  }

  async function handleImport() {
    const validRows = rows.filter((_, i) => !errorsByRow.has(i))
    if (validRows.length === 0) { setError('No valid rows to import. Fix the highlighted errors first.'); return }
    if (validRows.length > SERVER_ROW_CAP) { setError(`Too many valid rows (${validRows.length}). The importer accepts ${SERVER_ROW_CAP} at a time.`); return }
    setImporting(true); setError(null)

    const csv = Papa.unparse(
      validRows.map(r => {
        const o: Row = {}
        for (const c of EXPECTED_COLUMNS) o[c] = r[c] ?? ''
        return o
      }),
      { columns: [...EXPECTED_COLUMNS], header: true },
    )
    const blob = new File([csv], 'question-bank.csv', { type: 'text/csv' })
    const fd = new FormData(); fd.append('file', blob)

    try {
      const res = await fetch('/api/upcat-questions/import', { method: 'POST', body: fd })
      const body = await res.json()
      if (!res.ok) {
        const message = body.error ?? 'Import failed'
        setError(message)
        notifyError(message)
        return
      }
      setResult(body)
      notifySuccess(`Imported ${body.questions} question${body.questions === 1 ? '' : 's'} across ${body.passages} passage${body.passages === 1 ? '' : 's'}`)
    } catch (e: any) {
      const message = e?.message ?? 'Import failed'
      setError(message)
      notifyError(message)
    } finally {
      setImporting(false)
    }
  }

  async function handleProject() {
    setProjecting(true); setError(null)
    try {
      const res = await fetch('/api/flashcards/project', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) {
        const message = body.error ?? 'Projection failed'
        setError(message)
        notifyError(message)
        return
      }
      setProjection(body)
      notifySuccess(`Projected ${body.cards} cards · ${body.topics} topics · ${body.subjects} subjects`)
    } catch (e: any) {
      const message = e?.message ?? 'Projection failed'
      setError(message)
      notifyError(message)
    } finally {
      setProjecting(false)
    }
  }

  const busy = importing || projecting

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar
        title="Import Question Bank"
        exportHref="/api/admin/upcat-questions/export"
        actions={<GenerateExplanationsButton source="upcat_questions" label="Generate explanations for questions" />}
      />
      <PageBody
        width="wide"
        intro={<>
          Upload the authored Question Bank CSV (Q ID, Subtest, Main Subject, Topic, Options A–D, Answer,
          Passage / Set Text, …). Friendly tracker labels or snake_case headers both work, and text encoding is
          repaired automatically. Rows are validated below — fix any errors inline, then import. Rows marked{' '}
          <strong className="font-semibold text-ink">Approved</strong> are published; other statuses import as drafts.
        </>}
      >
        <CsvDropzone
          onFileSelected={handleFile}
          disabled={busy}
          hint="Max 5 MB · UTF-8 · feeds the UPCAT mock-exam engine; project afterward to also feed the flashcard quiz."
          sampleHref="/question-bank-sample.csv"
          sampleLabel="Download sample Question Bank CSV"
        />

        {error && <ErrorBanner title="Import problem" message={error} />}

        {result && (
          <Card title="Import complete">
            <div className="space-y-3">
              <p className="flex items-start gap-2 text-sm font-medium text-success-strong">
                <Icon name="check" className="mt-0.5 shrink-0" />
                Imported {result.questions} questions across {result.passages} passages into the question bank.
              </p>
              <p className="text-ui text-ink-muted">
                Step 2 — project the published questions into the flashcard quiz engine so they appear in the
                mobile app&apos;s topic/deck practice (in addition to the UPCAT mock exams).
              </p>
              <Button variant="primary" onClick={handleProject} loading={projecting}>
                {projecting ? 'Projecting…' : 'Project to flashcards'}
              </Button>
              {projection && (
                <p role="status" className="flex items-start gap-2 text-sm font-medium text-ink">
                  <Icon name="check" className="mt-0.5 shrink-0 text-success" />
                  Flashcards now: {projection.cards} cards · {projection.topics} topics · {projection.subjects} subjects.
                </p>
              )}
            </div>
          </Card>
        )}

        {rows.length > 0 && !result && (
          <div className="space-y-3">
            {/* Summary + controls */}
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge tone="success">{validCount} rows valid</Badge>
              {errorRowCount > 0 && <Badge tone="danger">{errorRowCount} rows have errors</Badge>}
              <span className="text-xs tabular-nums text-ink-muted">{rows.length} total</span>
              <label className="ml-auto inline-flex cursor-pointer items-center gap-2 text-ui text-ink">
                <input type="checkbox" className="h-4 w-4 cursor-pointer accent-maroon" checked={showOnlyErrors} onChange={e => { setShowOnlyErrors(e.target.checked); setPage(0) }} />
                Show only rows with errors
              </label>
            </div>

            {/* Bulk subtest fix — the most common error class */}
            {errorRowCount > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-sm bg-warning-soft px-3 py-2">
                <label htmlFor="bulk-subtest" className="text-ui text-warning-strong">
                  Bulk fix: set the subtest on every row whose subtest is missing or invalid
                </label>
                <select
                  id="bulk-subtest"
                  value={bulkSubtest}
                  onChange={e => setBulkSubtest(e.target.value)}
                  className={`${controlClass} h-8 w-auto text-ui`}
                >
                  <option value="">Choose subtest</option>
                  {VALID_SUBTESTS.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <Button size="sm" onClick={applyBulkSubtest} disabled={!bulkSubtest}>Apply</Button>
              </div>
            )}

            {displayedAll.length === 0 ? (
              <p role="status" className="flex items-center justify-center gap-2 rounded-sm bg-success-soft px-4 py-6 text-center text-ui font-medium text-success-strong">
                <Icon name="check" />
                No rows with errors. Ready to import.
              </p>
            ) : (
              <>
                <QuestionBankEditorTable
                  displayed={pageRows}
                  errorsByRow={errorsByRow}
                  subtests={VALID_SUBTESTS}
                  onEdit={updateCell}
                />
                {pageCount > 1 && (
                  <nav aria-label="Rows pages" className="flex items-center justify-center gap-3">
                    <Button variant="ghost" size="sm" icon="chevron-left" disabled={safePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}>Prev</Button>
                    <span className="text-xs tabular-nums text-ink-muted">Page {safePage + 1} of {pageCount} · showing {pageRows.length} of {displayedAll.length}{showOnlyErrors ? ' error rows' : ' rows'}</span>
                    <Button variant="ghost" size="sm" disabled={safePage >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}>
                      Next <Icon name="chevron-right" />
                    </Button>
                  </nav>
                )}
              </>
            )}

            {/* Import action */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button variant="primary" onClick={handleImport} loading={importing} disabled={busy || validCount === 0}>
                {importing ? 'Importing…' : `Import ${validCount} question${validCount === 1 ? '' : 's'}`}
              </Button>
              {errorRowCount > 0 && (
                <span className="text-xs text-warning-strong">{errorRowCount} row{errorRowCount === 1 ? '' : 's'} with errors will be skipped — fix them above to include them.</span>
              )}
            </div>
          </div>
        )}
      </PageBody>
    </div>
  )
}
