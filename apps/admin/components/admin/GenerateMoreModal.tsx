'use client'

import { useState } from 'react'
import { notifySuccess, notifyError } from '@/lib/toast'
import { Dialog } from '@/components/ui/Dialog'
import { Field, controlClass } from '@/components/ui/Field'
import { Button } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'

interface Props {
  open: boolean
  onClose: () => void
  topicId: string
  topicName: string
  subjectName: string
  existingQuestions: string[]
  listingSlugs: string[]
  onSuccess: () => void  // refresh callback for parent
}

const COUNTS = [5, 10, 15, 20] as const
const DEFAULT_COUNT = 5

export function GenerateMoreModal({
  open,
  onClose,
  topicId,
  topicName,
  subjectName,
  existingQuestions,
  listingSlugs,
  onSuccess,
}: Props) {
  const [count, setCount] = useState<number>(DEFAULT_COUNT)
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState('')

  async function handleGenerate() {
    if (isGenerating) return
    setIsGenerating(true)
    setError('')
    try {
      // 1. Call /generate to get N new cards w/ distractors already filled
      const genRes = await fetch('/api/flashcards/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_name: subjectName,
          topic_name: topicName,
          listing_slugs: listingSlugs,
          count,
          existing_questions: existingQuestions,
        }),
      })
      const genBody = await genRes.json() as {
        cards?: Array<{
          question: string; answer: string; explanation: string;
          aiOptions?: string[]; aiCorrectIndex?: number; aiExplanation?: string;
        }>;
        error?: string;
      }
      if (!genRes.ok || !genBody.cards) {
        const message = genBody.error ?? 'Generation failed'
        setError(message)
        notifyError(message)
        return
      }

      // 2. Insert them into this topic directly (server-side insert via /cards)
      const insertRes = await fetch('/api/flashcards/cards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic_id: topicId,
          listing_slugs: listingSlugs,
          cards: genBody.cards,
        }),
      })
      if (!insertRes.ok) {
        const body = await insertRes.json() as { error?: string }
        const message = body.error ?? 'Insert failed'
        setError(message)
        notifyError(message)
        return
      }

      notifySuccess(`${genBody.cards.length} card${genBody.cards.length === 1 ? '' : 's'} generated`)
      onSuccess()
      onClose()
    } catch {
      setError('Network error')
      notifyError('Network error')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => { if (!isGenerating) onClose() }}
      title="Generate cards with AI"
      description={<>For <strong className="font-medium text-ink">{topicName}</strong> in {subjectName}. {existingQuestions.length} existing card{existingQuestions.length === 1 ? '' : 's'} — Gemini avoids duplicates.</>}
      onSubmit={handleGenerate}
      dirty={count !== DEFAULT_COUNT}
      footer={close => (
        <>
          <Button onClick={close} disabled={isGenerating}>Cancel</Button>
          <Button type="submit" variant="primary" loading={isGenerating}>
            {isGenerating ? 'Generating…' : `Generate ${count} cards`}
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        {error && <ErrorBanner title="Couldn’t generate cards" message={error} />}
        <Field label="Number of cards" required>
          {p => (
            <select {...p} value={count} disabled={isGenerating} onChange={e => setCount(Number(e.target.value))} className={`${controlClass} max-w-[10rem]`}>
              {COUNTS.map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          )}
        </Field>
      </div>
    </Dialog>
  )
}
