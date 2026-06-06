'use client'
import { useState } from 'react'
import Papa from 'papaparse'
import { Topbar } from '@/components/admin/Topbar'
import { CsvDropzone } from '@/components/flashcards/CsvDropzone'

export default function UpcatImportPage() {
  const [file, setFile] = useState<File | null>(null)
  const [previewRows, setPreviewRows] = useState<Array<Record<string, string>>>([])
  const [totalRows, setTotalRows] = useState(0)
  const [error, setError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<{ passages: number; questions: number } | null>(null)

  function handleFile(f: File) {
    setFile(f); setError(null); setResult(null)
    if (f.size > 5 * 1024 * 1024) { setError('File too large (max 5MB)'); return }
    f.text().then(text => {
      const parsed = Papa.parse(text, { header: true, skipEmptyLines: true, transformHeader: h => h.trim().toLowerCase().replace(/^﻿/, '') })
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

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title="Import UPCAT Questions" />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          <div>
            <h2 className="text-[#1d1d1f] font-heading font-bold text-2xl tracking-tight">Import UPCAT question bank</h2>
            <p className="text-[#6e6e73] text-sm mt-1">Upload the authored UPCAT CSV (question_id, subtest, options A–D, correct_answer, passage sets). No AI enhancement — options are authored.</p>
          </div>
          <CsvDropzone onFileSelected={handleFile} disabled={importing} />
          {error && <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">{error}</div>}
          {result && (
            <div className="rounded-2xl border border-green-200 bg-green-50 p-6 shadow-sm">
              <div className="text-[#1d1d1f] font-heading font-bold">✓ Imported {result.questions} questions across {result.passages} passages</div>
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
