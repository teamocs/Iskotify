'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import { CsvDropzone } from '@/components/flashcards/CsvDropzone'
import { CsvPreviewTable } from '@/components/flashcards/CsvPreviewTable'

interface RowError { rowIndex: number; field: string; message: string }

export default function ImportCsvPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [previewRows, setPreviewRows] = useState<Array<Record<string, string>>>([])
  const [totalRows, setTotalRows] = useState(0)
  const [rowErrors, setRowErrors] = useState<RowError[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)

  function handleFile(f: File) {
    setFile(f); setFileError(null); setRowErrors([])
    if (f.size > 5 * 1024 * 1024) { setFileError('File too large (max 5MB)'); return }

    f.text().then(text => {
      const parsed = Papa.parse(text, {
        header: true, skipEmptyLines: true,
        transformHeader: h => h.trim().toLowerCase().replace(/^﻿/, ''),
      })
      const all = parsed.data as Array<Record<string, string>>
      setTotalRows(all.length)
      setPreviewRows(all.slice(0, 10))
    })
  }

  async function handleImport() {
    if (!file) return
    setImporting(true); setRowErrors([])
    const fd = new FormData()
    fd.append('file', file)
    const res = await fetch('/api/flashcards/import-csv', { method: 'POST', body: fd })
    const body = await res.json()
    if (!res.ok) {
      if (Array.isArray(body.rowErrors)) setRowErrors(body.rowErrors)
      else setFileError(body.error ?? 'Import failed')
      setImporting(false)
      return
    }
    router.push('/admin/flashcards/drafts')
  }

  const canImport = file && !fileError && rowErrors.length === 0 && totalRows > 0

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-white">Import CSV</h1>
        <p className="text-white/50 text-sm mt-1">Upload a 6-column CSV of flashcards. Subjects + topics auto-created, distractors filled by Gemini when missing.</p>
      </div>

      <CsvDropzone onFileSelected={handleFile} disabled={importing} />

      {fileError && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-red-300 text-sm">
          {fileError}
        </div>
      )}

      {file && previewRows.length > 0 && (
        <CsvPreviewTable rows={previewRows} totalRows={totalRows} rowErrors={rowErrors} />
      )}

      {file && (
        <div className="flex items-center gap-3">
          <button
            onClick={handleImport}
            disabled={!canImport || importing}
            className={`
              rounded-lg px-5 py-2.5 text-sm font-semibold transition
              ${canImport && !importing
                ? 'bg-[#800000] text-white hover:bg-[#9a0a1f]'
                : 'bg-white/10 text-white/30 cursor-not-allowed'}
            `}
          >
            {importing ? 'Importing…' : `Import ${totalRows} card${totalRows === 1 ? '' : 's'}`}
          </button>
          {rowErrors.length > 0 && (
            <span className="text-red-400 text-sm">Fix errors and re-upload</span>
          )}
        </div>
      )}
    </div>
  )
}
