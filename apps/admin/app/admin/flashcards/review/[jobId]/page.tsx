'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ExamTagSelector } from '@/components/flashcards/ExamTagSelector'
import { CardReviewTable, type Card } from '@/components/flashcards/CardReviewTable'

interface Listing {
  slug: string
  title: string
}

interface PageProps {
  params: Promise<{ jobId: string }>
}

export default function ReviewPage({ params }: PageProps) {
  const { jobId } = use(params)
  const router = useRouter()

  const [cards, setCards] = useState<Card[]>([])
  const [listings, setListings] = useState<Listing[]>([])
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])
  const [subjectName, setSubjectName] = useState('')
  const [topicName, setTopicName] = useState('')
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [jobRes, listingsRes] = await Promise.all([
          fetch(`/api/flashcards/jobs/${jobId}`),
          fetch('/api/admin/listings'),
        ])

        const job = await jobRes.json()
        const listingsData = await listingsRes.json()

        setListings(
          (Array.isArray(listingsData) ? listingsData : []).map(
            (l: { slug: string; title: string }) => ({ slug: l.slug, title: l.title })
          )
        )

        if (job.topic_id && job.subject_id) {
          const [cardsRes, topicRes, subjectRes] = await Promise.all([
            fetch(`/api/flashcards/cards?topic_id=${job.topic_id}`),
            fetch(`/api/flashcards/topics/${job.topic_id}`),
            fetch(`/api/flashcards/subjects/${job.subject_id}`),
          ])
          if (cardsRes.ok) setCards(await cardsRes.json())
          if (topicRes.ok) setTopicName((await topicRes.json()).name ?? '')
          if (subjectRes.ok) setSubjectName((await subjectRes.json()).name ?? '')
        }
      } catch (err) {
        console.error('[review] load error:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [jobId])

  async function handleUpdate(id: string, updates: Partial<Card>) {
    await fetch(`/api/flashcards/cards/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
      headers: { 'Content-Type': 'application/json' },
    })
    setCards((prev) => prev.map((c) => (c.id === id ? { ...c, ...updates } : c)))
  }

  async function handleDelete(id: string) {
    await fetch(`/api/flashcards/cards/${id}`, { method: 'DELETE' })
    setCards((prev) => prev.filter((c) => c.id !== id))
  }

  function handleAdd() {
    const blank: Card = {
      id: `new-${Date.now()}`,
      question: '',
      answer: '',
      explanation: '',
    }
    setCards((prev) => [...prev, blank])
  }

  async function handlePublish() {
    if (selectedSlugs.length === 0 || publishing) return
    setPublishing(true)
    setPublishError('')
    try {
      const res = await fetch(`/api/flashcards/publish/${jobId}`, {
        method: 'POST',
        body: JSON.stringify({ listing_slugs: selectedSlugs, subject_name: subjectName, topic_name: topicName }),
        headers: { 'Content-Type': 'application/json' },
      })
      if (res.ok) {
        router.push('/admin/flashcards')
      } else {
        const body = await res.json()
        setPublishError(body.error ?? 'Publish failed')
        setPublishing(false)
      }
    } catch {
      setPublishError('Publish failed — check your connection')
      setPublishing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center flex-1">
        <div className="w-8 h-8 border-[3px] border-[#800000] border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-[#e5e7eb] bg-[#fafafa]">
        <div className="flex items-center gap-3">
          <Link href="/admin/flashcards/upload" className="text-xs text-[#6e6e73] hover:text-[#1d1d1f] transition-colors">
            ← Upload PDF
          </Link>
          <span className="text-[#e5e7eb]">|</span>
          <span className="font-bold text-[#1d1d1f] text-sm">Review Extracted Cards</span>
          <span className="bg-green-100 text-green-800 text-[10px] font-semibold rounded-full px-2 py-0.5">
            {cards.length} cards
          </span>
        </div>
        <div className="flex items-center gap-3">
          {publishError && <p className="text-xs text-[#800000] font-medium">{publishError}</p>}
          <button
            onClick={handlePublish}
            disabled={selectedSlugs.length === 0 || publishing}
            className="px-4 py-2 bg-[#800000] text-white text-xs font-semibold rounded-full hover:bg-[#6b0000] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {publishing ? 'Publishing…' : 'Publish to Knowledge Base →'}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        {/* Subject / Topic inputs */}
        <div className="bg-white border border-[#e5e7eb] rounded-2xl p-4">
          <p className="text-[11px] font-bold text-[#800000] uppercase tracking-wider mb-3">
            Inferred by Gemini — edit if needed
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">SUBJECT</label>
              <input
                value={subjectName}
                onChange={(e) => setSubjectName(e.target.value)}
                className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm w-full font-semibold text-[#1d1d1f]"
              />
            </div>
            <div>
              <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">TOPIC</label>
              <input
                value={topicName}
                onChange={(e) => setTopicName(e.target.value)}
                className="border border-[#800000] rounded-lg px-3 py-2 text-sm w-full font-semibold text-[#1d1d1f]"
              />
            </div>
          </div>
        </div>

        <ExamTagSelector
          listings={listings}
          selected={selectedSlugs}
          onChange={setSelectedSlugs}
        />

        <CardReviewTable
          cards={cards}
          onUpdate={handleUpdate}
          onDelete={handleDelete}
          onAdd={handleAdd}
        />
      </div>
    </div>
  )
}
