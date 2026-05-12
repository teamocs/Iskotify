'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Topbar } from '@/components/admin/Topbar'
import { UploadDropzone } from '@/components/flashcards/UploadDropzone'

type UIState = 'idle' | 'processing' | 'done' | 'failed'

interface DoneData {
  cardCount: number
  jobId: string
}

const JOB_KEY = 'iskotify_last_job_id'
const POLL_MS = 3000

export default function UploadPDFPage() {
  const router = useRouter()
  const [uiState, setUiState] = useState<UIState>('idle')
  const [fileName, setFileName] = useState('')
  const [errorMsg, setErrorMsg] = useState('')
  const [doneData, setDoneData] = useState<DoneData | null>(null)

  useEffect(() => {
    const savedJobId = localStorage.getItem(JOB_KEY)
    if (savedJobId) resumePolling(savedJobId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleFile(file: File) {
    setFileName(file.name)
    setUiState('processing')

    const fd = new FormData()
    fd.append('file', file)

    let jobId: string
    try {
      const uploadRes = await fetch('/api/flashcards/upload', { method: 'POST', body: fd })
      if (!uploadRes.ok) {
        const { error } = await uploadRes.json()
        setErrorMsg(error ?? 'Upload failed')
        setUiState('failed')
        return
      }
      const data = await uploadRes.json()
      jobId = data.jobId
    } catch {
      setErrorMsg('Upload failed — check your connection')
      setUiState('failed')
      return
    }

    localStorage.setItem(JOB_KEY, jobId)
    // Kick off processing (fire-and-forget — polling detects completion)
    fetch(`/api/flashcards/process/${jobId}`, { method: 'POST' }).catch(() => {})
    resumePolling(jobId)
  }

  function resumePolling(jobId: string) {
    setUiState('processing')
    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/api/flashcards/jobs/${jobId}`)
        if (!res.ok) return
        const job = await res.json()

        if (job.status === 'done') {
          clearInterval(timer)
          localStorage.removeItem(JOB_KEY)
          setDoneData({ cardCount: job.card_count ?? 0, jobId })
          setUiState('done')
        } else if (job.status === 'failed') {
          clearInterval(timer)
          localStorage.removeItem(JOB_KEY)
          setErrorMsg(job.error_msg ?? 'Extraction failed')
          setUiState('failed')
        }
      } catch {
        // network hiccup — keep polling
      }
    }, POLL_MS)
  }

  return (
    <>
      <Topbar title="Upload PDF" />
      <div className="flex-1 overflow-y-auto p-6 max-w-xl">
        {uiState === 'idle' && (
          <UploadDropzone onFile={handleFile} />
        )}

        {uiState === 'processing' && (
          <div className="border border-[#e5e7eb] rounded-xl p-5 bg-white flex items-center gap-4">
            <div className="w-8 h-8 border-[3px] border-[#800000] border-t-transparent rounded-full animate-spin flex-shrink-0" />
            <div>
              <p className="font-semibold text-[#1d1d1f] text-sm">Extracting flashcards…</p>
              <p className="text-[#6e6e73] text-xs mt-0.5">{fileName || 'Processing…'} · Gemini is reading</p>
            </div>
          </div>
        )}

        {uiState === 'done' && doneData && (
          <div className="border border-[#bbf7d0] rounded-xl p-5 bg-[#f0fdf4] flex items-center justify-between gap-4">
            <div>
              <p className="font-semibold text-[#166534] text-sm">✓ {doneData.cardCount} cards extracted</p>
              <p className="text-[#6e6e73] text-xs mt-0.5">Ready to review</p>
            </div>
            <button
              onClick={() => router.push(`/admin/flashcards/review/${doneData.jobId}`)}
              className="px-4 py-2 bg-[#800000] text-white text-xs font-semibold rounded-lg hover:bg-[#6b0000] transition-colors"
            >
              Review →
            </button>
          </div>
        )}

        {uiState === 'failed' && (
          <div className="border border-[#fecaca] rounded-xl p-5 bg-[#fef2f2] flex items-center justify-between gap-4">
            <p className="text-[#800000] text-sm font-medium">{errorMsg}</p>
            <button
              onClick={() => { setUiState('idle'); setErrorMsg('') }}
              className="px-3 py-1.5 text-xs font-semibold border border-[#fecaca] rounded-lg text-[#800000] hover:bg-[#fee2e2] transition-colors"
            >
              Try again
            </button>
          </div>
        )}
      </div>
    </>
  )
}
