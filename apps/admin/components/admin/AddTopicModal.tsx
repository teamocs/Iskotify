'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Props {
  subjectId: string
  onClose: () => void
}

export function AddTopicModal({ subjectId, onClose }: Props) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setError('')
    try {
      const res = await fetch('/api/flashcards/topics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject_id: subjectId, name: name.trim(), status: 'published' }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        setError(body.error ?? 'Something went wrong')
        return
      }
      router.refresh()
      onClose()
    } catch {
      setError('Network error')
    } finally {
      setSaving(false)
    }
  }

  const inputCls = 'w-full px-3 py-2 rounded-[10px] border border-black/[0.08] text-sm bg-[#fafafa] focus:outline-none focus:ring-2 focus:ring-[#800000]/20 focus:border-[#800000] text-[#1d1d1f]'
  const labelCls = 'block text-[10px] font-semibold text-[#aeaeb2] uppercase tracking-wider mb-1'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-6 py-4 border-b border-black/[0.08]">
          <h2 className="font-heading font-bold text-[17px] text-[#1d1d1f]">Add Topic</h2>
          <button onClick={onClose} className="text-[#aeaeb2] hover:text-[#1d1d1f] text-xl">✕</button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className={labelCls}>Topic name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Algebra Basics"
              className={inputCls}
              autoFocus
            />
          </div>
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-[10px] px-3 py-2">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-[980px] text-sm font-medium border border-black/[0.08] text-[#1d1d1f] hover:bg-[#f5f5f7]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim() || saving}
              className="px-5 py-2 rounded-[980px] text-sm font-medium bg-[#800000] text-white hover:bg-[#a00000] disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Add Topic'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
