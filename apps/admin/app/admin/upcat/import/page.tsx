'use client'
import { useMemo, useState } from 'react'
import Papa from 'papaparse'
import { Topbar } from '@/components/admin/Topbar'
import { CsvDropzone } from '@/components/flashcards/CsvDropzone'
import { QuestionBankEditorTable, type DisplayRow } from '@/components/flashcards/QuestionBankEditorTable'
import { normalizeQuestionBankHeader } from '@/lib/csv/questionBankHeaders'
import { cleanImportedText } from '@/lib/csv/cleaners'
import { VALID_SUBTESTS } from '@/lib/upcat/importUpcatCore'
import { validateAllQbRows, EXPECTED_COLUMNS, normalizeAnswerLetter } from '@/lib/upcat/validateQuestionBank'

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
      if (!res.ok) { setError(body.error ?? 'Import failed'); return }
      setResult(body)
    } catch (e: any) {
      setError(e?.message ?? 'Import failed')
    } finally {
      setImporting(false)
    }
  }

  async function handleProject() {
    setProjecting(true); setError(null)
    try {
      const res = await fetch('/api/flashcards/project', { method: 'POST' })
      const body = await res.json()
      if (!res.ok) { setError(body.error ?? 'Projection failed'); return }
      setProjection(body)
    } catch (e: any) {
      setError(e?.message ?? 'Projection failed')
    } finally {
      setProjecting(false)
    }
  }

  const busy = importing || projecting

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title="Import Question Bank" exportHref="/api/admin/upcat-questions/export" />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-6xl mx-auto space-y-6">
          <div>
            <h2 className="text-[#1d1d1f] font-heading font-bold text-2xl tracking-tight">Import the Question Bank</h2>
            <p className="text-[#6e6e73] text-sm mt-1">
              Upload the authored Question Bank CSV (Q ID, Subtest, Main Subject, Topic, Options A–D, Answer,
              Passage / Set Text, …). Friendly tracker labels or snake_case headers both work, and text encoding is
              repaired automatically. Rows are validated below — fix any errors inline, then import. Rows marked{' '}
              <strong>Approved</strong> are published; other statuses import as drafts.
            </p>
          </div>

          <CsvDropzone
            onFileSelected={handleFile}
            disabled={busy}
            hint="Max 5 MB · UTF-8 · feeds the UPCAT mock-exam engine; project afterward to also feed the flashcard quiz."
            sampleHref="/question-bank-sample.csv"
            sampleLabel="Download sample Question Bank CSV"
          />

          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">{error}</div>}

          {result && (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-6 shadow-sm space-y-4">
              <div className="text-[#1d1d1f] font-heading font-bold">✓ Imported {result.questions} questions across {result.passages} passages into the question bank.</div>
              <p className="text-[#3a3a3c] text-sm">
                Step 2 — project the published questions into the flashcard quiz engine so they appear in the
                mobile app&apos;s topic/deck practice (in addition to the UPCAT mock exams).
              </p>
              <button type="button" onClick={handleProject} disabled={projecting}
                className={`inline-flex items-center rounded-[980px] px-5 py-2 text-sm font-semibold transition-colors shadow-sm ${projecting ? 'bg-[#f5f5f7] text-[#6e6e73]' : 'bg-[#800000] text-white hover:bg-[#9a0a1f]'}`}>
                {projecting ? 'Projecting…' : 'Project to flashcards'}
              </button>
              {projection && (
                <div className="text-[#1d1d1f] text-sm font-medium">
                  ✓ Flashcards now: {projection.cards} cards · {projection.topics} topics · {projection.subjects} subjects.
                </div>
              )}
            </div>
          )}

          {rows.length > 0 && !result && (
            <div className="space-y-3">
              {/* Summary + controls */}
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-800">{validCount} rows valid</span>
                {errorRowCount > 0 && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-800">{errorRowCount} rows have errors</span>
                )}
                <span className="text-[#6e6e73] text-xs">{rows.length} total</span>
                <label className="ml-auto inline-flex items-center gap-2 text-[#3a3a3c] text-xs cursor-pointer">
                  <input type="checkbox" checked={showOnlyErrors} onChange={e => { setShowOnlyErrors(e.target.checked); setPage(0) }} />
                  Show only rows with errors
                </label>
              </div>

              {/* Bulk subtest fix — the most common error class */}
              {errorRowCount > 0 && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                  <span className="text-amber-900 text-xs">Bulk fix: set subtest for every row whose subtest is missing or invalid →</span>
                  <select value={bulkSubtest} onChange={e => setBulkSubtest(e.target.value)}
                    className="border border-black/[0.15] rounded-md px-2 py-1 text-[13px] bg-white">
                    <option value="">— choose subtest —</option>
                    {VALID_SUBTESTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                  <button type="button" onClick={applyBulkSubtest} disabled={!bulkSubtest}
                    className={`rounded-md px-3 py-1 text-xs font-semibold ${bulkSubtest ? 'bg-amber-600 text-white hover:bg-amber-700' : 'bg-black/[0.06] text-[#6e6e73] cursor-not-allowed'}`}>
                    Apply
                  </button>
                </div>
              )}

              {displayedAll.length === 0 ? (
                <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-6 text-center text-green-800 text-sm">
                  🎉 No rows with errors. Ready to import.
                </div>
              ) : (
                <>
                  <QuestionBankEditorTable
                    displayed={pageRows}
                    errorsByRow={errorsByRow}
                    subtests={VALID_SUBTESTS}
                    onEdit={updateCell}
                  />
                  {pageCount > 1 && (
                    <div className="flex items-center justify-center gap-3 text-sm">
                      <button type="button" disabled={safePage === 0} onClick={() => setPage(p => Math.max(0, p - 1))}
                        className={`rounded-md px-3 py-1 ${safePage === 0 ? 'text-[#b0b0b5]' : 'text-[#800000] hover:bg-black/[0.04]'}`}>← Prev</button>
                      <span className="text-[#6e6e73] text-xs tabular-nums">Page {safePage + 1} of {pageCount} · showing {pageRows.length} of {displayedAll.length}{showOnlyErrors ? ' error rows' : ' rows'}</span>
                      <button type="button" disabled={safePage >= pageCount - 1} onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                        className={`rounded-md px-3 py-1 ${safePage >= pageCount - 1 ? 'text-[#b0b0b5]' : 'text-[#800000] hover:bg-black/[0.04]'}`}>Next →</button>
                    </div>
                  )}
                </>
              )}

              {/* Import action */}
              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button onClick={handleImport} disabled={busy || validCount === 0}
                  className={`inline-flex items-center rounded-[980px] px-5 py-2 text-sm font-semibold transition-colors shadow-sm ${busy || validCount === 0 ? 'bg-[#f5f5f7] text-[#6e6e73] cursor-not-allowed' : 'bg-[#800000] text-white hover:bg-[#9a0a1f]'}`}>
                  {importing ? 'Importing…' : `Import ${validCount} question${validCount === 1 ? '' : 's'}`}
                </button>
                {errorRowCount > 0 && (
                  <span className="text-amber-700 text-xs">{errorRowCount} row{errorRowCount === 1 ? '' : 's'} with errors will be skipped — fix them above to include them.</span>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
