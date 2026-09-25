'use client'

import { useEffect, useState } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { Topbar } from '@/components/admin/Topbar'
import { PublishModal } from '@/components/flashcards/PublishModal'
import { ReviewCardList, type ReviewCard } from '@/components/flashcards/ReviewCardList'
import { PageBody } from '@/components/ui/Page'
import { Card } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { EmptyState } from '@/components/ui/EmptyState'

interface Topic {
  id: string
  name: string
  status: string
  subject_id: string | null
  subject_name: string
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

export default function ReviewPage() {
  const params = useParams<{ topicId: string }>()
  const router = useRouter()
  const topicId = params.topicId

  const [topic, setTopic] = useState<Topic | null>(null)
  const [cards, setCards] = useState<ReviewCard[]>([])
  const [loading, setLoading] = useState(true)
  const [publishModalOpen, setPublishModalOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let aborted = false
    async function load() {
      setLoading(true); setError(null)
      try {
        const [topicRes, cardsRes] = await Promise.all([
          fetch(`/api/flashcards/topics/${topicId}`),
          fetch(`/api/flashcards/cards?topic_id=${topicId}`),
        ])
        if (!topicRes.ok) throw new Error(`Topic load failed (${topicRes.status})`)
        if (!cardsRes.ok) throw new Error(`Cards load failed (${cardsRes.status})`)
        const topicBody: Topic = await topicRes.json()
        const cardsBody: ReviewCard[] = await cardsRes.json()
        if (aborted) return
        setTopic(topicBody)
        setCards(cardsBody)
      } catch (e: any) {
        if (!aborted) setError(e?.message ?? 'Failed to load')
      } finally {
        if (!aborted) setLoading(false)
      }
    }
    load()
    return () => { aborted = true }
  }, [topicId])

  function handlePublished() {
    setPublishModalOpen(false)
    router.push('/admin/flashcards/drafts')
  }

  const title = topic ? `Review: ${topic.name}` : 'Review & Publish'
  const canPublish = !loading && !error && cards.length > 0

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
      <Topbar
        title={title}
        actions={
          <Button variant="primary" size="sm" disabled={!canPublish} onClick={() => setPublishModalOpen(true)}>
            {`Publish ${plural(cards.length, 'card')}…`}
          </Button>
        }
      />
      <PageBody
        width="narrow"
        intro={
          loading
            ? undefined
            : topic
              ? `${topic.subject_name} · ${plural(cards.length, 'card')}${cards.length > 0 ? '. Review them below, then publish to ship them to mobile.' : ''}`
              : undefined
        }
      >
        {error && <ErrorBanner title="Couldn’t load this topic" message={error} />}

        <Card title="Cards" flush>
          {loading ? (
            <p role="status" className="px-4 py-10 text-center text-ui text-ink-muted">Loading cards…</p>
          ) : cards.length === 0 ? (
            <EmptyState
              title="No cards in this topic"
              description="Cards appear here once an import or manual add puts them in this topic."
            />
          ) : (
            <ReviewCardList cards={cards} />
          )}
        </Card>
      </PageBody>

      <PublishModal
        open={publishModalOpen}
        title={`Publish "${topic?.name ?? 'topic'}"`}
        description={`Pick at least one exam or scholarship tag. All ${cards.length} cards in this topic will be tagged and marked published.`}
        topicIds={topic ? [topic.id] : []}
        onClose={() => setPublishModalOpen(false)}
        onPublished={handlePublished}
        primaryLabel={`Publish ${cards.length} cards`}
      />
    </div>
  )
}
