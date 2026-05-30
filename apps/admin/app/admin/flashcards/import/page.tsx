'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Papa from 'papaparse'
import { Topbar } from '@/components/admin/Topbar'
import { CsvDropzone } from '@/components/flashcards/CsvDropzone'
import { CsvPreviewTable } from '@/components/flashcards/CsvPreviewTable'
import { PublishModal } from '@/components/flashcards/PublishModal'

// Per-request server cap. Keep in sync with the import-csv route.
const CHUNK_SIZE = 500

interface RowError { rowIndex: number; field: string; message: string }
type CsvRow = Record<string, string>

interface ImportResult {
  topic_ids: string[]
  total_cards: number
  cards_needing_enhancement: number
}

interface ChunkProgress {
  done: number
  total: number
}

/**
 * Pack rows into ≤CHUNK_SIZE-row chunks WITHOUT splitting any (subject, topic)
 * group across chunks. The server inserts a fresh topic per chunk, so splitting
 * a topic would create duplicate topics with the same name.
 */
function chunkRowsByTopic(rows: CsvRow[], chunkSize: number): CsvRow[][] {
  const groups = new Map<string, CsvRow[]>()
  for (const r of rows) {
    const subject = (r.subject ?? '').trim()
    const topic = (r.topic ?? '').trim()
    const key = `${subject}::${topic}`
    const bucket = groups.get(key)
    if (bucket) bucket.push(r)
    else groups.set(key, [r])
  }

  const chunks: CsvRow[][] = []
  let current: CsvRow[] = []
  for (const group of groups.values()) {
    // If adding this whole group would push the chunk over the cap AND the chunk
    // already has at least one group, start a new chunk first.
    if (current.length > 0 && current.length + group.length > chunkSize) {
      chunks.push(current)
      current = []
    }
    current.push(...group)
  }
  if (current.length > 0) chunks.push(current)
  return chunks
}

function rowsToCsv(rows: CsvRow[]): string {
  // Match the original header order — papaparse preserves field order from data
  // but we want to be explicit so the server's header validator passes regardless.
  return Papa.unparse(rows, {
    columns: ['subject', 'topic', 'question', 'answer', 'explanation', 'distractors'],
    header: true,
  })
}

export default function ImportCsvPage() {
  const router = useRouter()
  const [file, setFile] = useState<File | null>(null)
  const [allRows, setAllRows] = useState<CsvRow[]>([])
  const [previewRows, setPreviewRows] = useState<CsvRow[]>([])
  const [totalRows, setTotalRows] = useState(0)
  const [rowErrors, setRowErrors] = useState<RowError[]>([])
  const [fileError, setFileError] = useState<string | null>(null)
  const [importing, setImporting] = useState(false)
  const [chunkProgress, setChunkProgress] = useState<ChunkProgress | null>(null)

  const [importResult, setImportResult] = useState<ImportResult | null>(null)
  const [publishModalOpen, setPublishModalOpen] = useState(false)

  function handleFile(f: File) {
    setFile(f)
    setFileError(null); setRowErrors([]); setImportResult(null); setChunkProgress(null)
    if (f.size > 5 * 1024 * 1024) { setFileError('File too large (max 5MB)'); return }

    f.text().then(text => {
      const parsed = Papa.parse(text, {
        header: true, skipEmptyLines: true,
        transformHeader: h => h.trim().toLowerCase().replace(/^﻿/, ''),
      })
      const all = parsed.data as CsvRow[]
      setAllRows(all)
      setTotalRows(all.length)
      setPreviewRows(all.slice(0, 10))
    })
  }

  async function handleImport() {
    if (!file || allRows.length === 0) return
    setImporting(true); setRowErrors([]); setFileError(null)

    const chunks = chunkRowsByTopic(allRows, CHUNK_SIZE)
    setChunkProgress({ done: 0, total: chunks.length })

    const aggregated: ImportResult = { topic_ids: [], total_cards: 0, cards_needing_enhancement: 0 }

    for (let i = 0; i < chunks.length; i++) {
      const chunkRows = chunks[i]!
      const csv = rowsToCsv(chunkRows)
      const blob = new File([csv], `chunk-${i + 1}.csv`, { type: 'text/csv' })
      const fd = new FormData()
      fd.append('file', blob)

      const res = await fetch('/api/flashcards/import-csv', { method: 'POST', body: fd })
      const body = await res.json()

      if (!res.ok) {
        // Tag row errors with their position in the ORIGINAL CSV, not this chunk,
        // so the preview highlights the right rows.
        const offset = chunks.slice(0, i).reduce((sum, c) => sum + c.length, 0)
        if (Array.isArray(body.rowErrors)) {
          const remapped: RowError[] = body.rowErrors.map((e: RowError) => ({
            ...e,
            rowIndex: e.rowIndex + offset,
          }))
          setRowErrors(remapped)
        } else {
          setFileError(
            chunks.length > 1
              ? `Batch ${i + 1} of ${chunks.length} failed: ${body.error ?? 'Import failed'}. ${i} batch${i === 1 ? '' : 'es'} (${aggregated.total_cards} card${aggregated.total_cards === 1 ? '' : 's'}) already saved as drafts.`
              : (body.error ?? 'Import failed')
          )
        }
        setImporting(false); setChunkProgress(null)
        return
      }

      aggregated.topic_ids.push(...(body.topic_ids ?? []))
      aggregated.total_cards += body.total_cards ?? 0
      aggregated.cards_needing_enhancement += body.cards_needing_enhancement ?? 0
      setChunkProgress({ done: i + 1, total: chunks.length })
    }

    setImporting(false); setChunkProgress(null)
    setImportResult(aggregated)
  }

  function handleAfterPublish() {
    setPublishModalOpen(false)
    setImportResult(null)
    router.push('/admin/flashcards')
  }

  const canImport = file && !fileError && rowErrors.length === 0 && totalRows > 0 && !importResult
  const chunkCount = chunkRowsByTopic(allRows, CHUNK_SIZE).length

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
              Larger files are uploaded in batches of {CHUNK_SIZE} rows automatically.
            </p>
          </div>

          <CsvDropzone onFileSelected={handleFile} disabled={importing} />

          {fileError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-red-800 text-sm">
              {fileError}
            </div>
          )}

          {file && previewRows.length > 0 && !importResult && (
            <CsvPreviewTable rows={previewRows} totalRows={totalRows} rowErrors={rowErrors} />
          )}

          {chunkProgress && (
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs text-[#6e6e73]">
                <span>Uploading batch {chunkProgress.done + (chunkProgress.done < chunkProgress.total ? 1 : 0)} of {chunkProgress.total}…</span>
                <span className="tabular-nums">{chunkProgress.done}/{chunkProgress.total}</span>
              </div>
              <div className="w-full h-1.5 bg-black/[0.08] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#800000] transition-all"
                  style={{ width: `${(chunkProgress.done / chunkProgress.total) * 100}%` }}
                />
              </div>
            </div>
          )}

          {importResult && (
            <ImportSuccessPanel
              result={importResult}
              onPublishNow={() => setPublishModalOpen(true)}
              onReviewLater={() => router.push('/admin/flashcards/drafts')}
            />
          )}

          {file && !importResult && (
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
                {importing
                  ? 'Importing…'
                  : chunkCount > 1
                    ? `Import ${totalRows} cards (${chunkCount} batches)`
                    : `Import ${totalRows} card${totalRows === 1 ? '' : 's'}`}
              </button>
              {rowErrors.length > 0 && (
                <span className="text-red-700 text-sm">Fix errors and re-upload</span>
              )}
            </div>
          )}
        </div>
      </div>

      <PublishModal
        open={publishModalOpen}
        title={`Publish ${importResult?.topic_ids.length ?? 0} new topic${(importResult?.topic_ids.length ?? 0) === 1 ? '' : 's'}`}
        description={
          `All ${importResult?.total_cards ?? 0} imported cards across ${importResult?.topic_ids.length ?? 0} topic` +
          `${(importResult?.topic_ids.length ?? 0) === 1 ? '' : 's'} will be tagged with the same exam/scholarship slugs and marked published.`
        }
        topicIds={importResult?.topic_ids ?? []}
        onClose={() => setPublishModalOpen(false)}
        onPublished={handleAfterPublish}
        primaryLabel={`Publish all ${importResult?.total_cards ?? 0} cards`}
      />
    </div>
  )
}

function ImportSuccessPanel({
  result, onPublishNow, onReviewLater,
}: {
  result: ImportResult
  onPublishNow: () => void
  onReviewLater: () => void
}) {
  const { topic_ids, total_cards, cards_needing_enhancement } = result
  const topicWord = topic_ids.length === 1 ? 'topic' : 'topics'
  return (
    <div className="rounded-2xl border border-green-200 bg-green-50 p-6 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 w-9 h-9 rounded-full bg-green-100 text-green-700 flex items-center justify-center text-lg">
          ✓
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-[#1d1d1f] font-heading font-bold text-base">
            Imported {total_cards} card{total_cards === 1 ? '' : 's'} across {topic_ids.length} {topicWord}
          </h3>
          <p className="text-[#1d1d1f]/70 text-sm mt-1">
            {cards_needing_enhancement > 0
              ? `${cards_needing_enhancement} card${cards_needing_enhancement === 1 ? ' is' : 's are'} being enhanced by Gemini in the background.`
              : 'All cards already have MCQ options — no enhancement needed.'}
          </p>
          <p className="text-[#1d1d1f]/70 text-sm mt-2">
            Cards are saved as <strong>draft</strong>. Would you like to publish them now (pick exam/scholarship tags once for all), or review each topic individually first?
          </p>

          <div className="flex flex-wrap items-center gap-2 mt-4">
            <button
              onClick={onPublishNow}
              className="inline-flex items-center rounded-[980px] bg-green-700 hover:bg-green-800 text-white px-5 py-2 text-sm font-semibold shadow-sm"
            >
              Publish now
            </button>
            <button
              onClick={onReviewLater}
              className="inline-flex items-center rounded-[980px] bg-white hover:bg-[#fafafb] text-[#1d1d1f] border border-black/[0.12] px-5 py-2 text-sm font-medium shadow-sm"
            >
              Review individually
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
