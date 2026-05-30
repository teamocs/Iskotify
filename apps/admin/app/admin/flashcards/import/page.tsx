'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import { Topbar } from '@/components/admin/Topbar'
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
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar title="Import CSV" />
      <div className="flex-1 overflow-y-auto">
        <div className="p-6 max-w-5xl mx-auto space-y-6">
          <div>
            <h2 className="text-[#1d1d1f] font-heading font-bold text-2xl tracking-tight">Import flashcards from CSV</h2>
            <p className="text-[#6e6e73] text-sm mt-1">
              Upload a 6-column CSV. Subjects and topics are auto-created on the fly. Cards without a
              <code className="mx-1 px-1.5 py-0.5 rounded bg-[#f5f5f7] text-[12px]">distractors</code>
              value will have their multiple-choice options filled by Gemini in the background.
            </p>
          </div>

          <CsvDropzone onFileSelected={handleFile} disabled={importing} />

          {fileError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
              {fileError}
            </div>
          )}

          {file && previewRows.length > 0 && (
            <CsvPreviewTable rows={previewRows} totalRows={totalRows} rowErrors={rowErrors} />
          )}

          {file && (
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={handleImport}
                disabled={!canImport || importing}
                className={`
                  inline-flex items-center rounded-[980px] px-5 py-2 text-sm font-semibold transition-colors shadow-sm
                  ${canImport && !importing
                    ? 'bg-[#800000] text-white hover:bg-[#9a0a1f]'
                    : 'bg-[#f5f5f7] text-[#6e6e73] cursor-not-allowed'}
                `}
              >
                {importing ? 'Importing…' : `Import ${totalRows} card${totalRows === 1 ? '' : 's'}`}
              </button>
              {rowErrors.length > 0 && (
                <span className="text-red-700 text-sm">Fix errors and re-upload</span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
