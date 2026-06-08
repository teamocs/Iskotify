'use client'
import { useState } from 'react'
import Papa from 'papaparse'
import { Topbar } from '@/components/admin/Topbar'
import { CsvDropzone } from '@/components/flashcards/CsvDropzone'
import { normalizeQuestionBankHeader } from '@/lib/csv/questionBankHeaders'

export default function QuestionBankImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [previewRows, setPreviewRows] = useState<Array<Record<string, string>>>([])
  const [totalRows, setTotalRows] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ passages: number; questions: number } | null>(null)
  const [projecting, setProjecting] = useState(false)
  const [projection, setProjection] = useState<{ subjects: number; topics: number; cards: number } | null>(null)

  function handleFile(f: File) {
    setFile(f); setError(null); setResult(null); setProjection(null)
    if (f.size > 5 * 1024 * 1024) { setError('File too large (max 5MB)'); return }
    f.text().then(text => {
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: normalizeQuestionBankHeader })
      const all = (parsed.data as Array<Record<string, string>>).filter(r => (r.question_id ?? '').trim())
      setTotalRows(all.length); setPreviewRows(all.slice(0, 10))
    }).catch(e => setError(e?.message ?? 'Could not read file'))
  }

  async function handleImport() {
    if (!file) return
    setImporting(true); setError(null)
    const fd = new FormData(); fd.append('file', file)
    const res = await fetch('/api/upcat-questions/import', { method: 'POST', body: fd })
    const body = await res.json()
    setImporting(false)
    if (!res.ok) { setError(body.error ?? 'Import failed'); return }
    setResult(body)
  }

  async function handleProject() {
    setProjecting(true); setError(null)
    const res = await fetch('/api/flashcards/project', { method: 'POST' })
    const body = await res.json()
    setProjecting(false)
    if (!res.ok) { setError(body.error ?? 'Projection failed'); return }
    setProjection(body)
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title="Import Question Bank" />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          <div>
            <h2 className="text-[#1d1d1f] font-heading font-bold text-2xl tracking-tight">Import the Question Bank</h2>
            <p className="text-[#6e6e73] text-sm mt-1">
              Upload the authored Question Bank CSV (Q ID, Subtest, Main Subject, Topic, Options A–D, Answer,
              Passage / Set Text, …). Headers may be the friendly tracker labels or snake_case — both are accepted,
              and text encoding is repaired automatically. Rows marked <strong>Approved</strong> are published;
              other statuses stay as drafts. Options are authored (no AI enhancement).
            </p>
          </div>
          <CsvDropzone
            onFileSelected={handleFile}
            disabled={importing || projecting}
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

          {file && previewRows.length > 0 && !result && (
            <div className="text-[#6e6e73] text-sm">{totalRows} rows detected · showing first {previewRows.length}</div>
          )}
          {file && !result && (
            <button onClick={handleImport} disabled={importing}
              className={`inline-flex items-center rounded-[980px] px-5 py-2 text-sm font-semibold transition-colors shadow-sm ${importing ? 'bg-[#f5f5f7] text-[#6e6e73]' : 'bg-[#800000] text-white hover:bg-[#9a0a1f]'}`}>
              {importing ? 'Importing…' : `Import ${totalRows} questions`}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
