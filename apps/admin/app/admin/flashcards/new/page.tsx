'use client'

import { useState, useEffect, useRef, type FormEvent, type MouseEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ExamTagSelector } from '@/components/flashcards/ExamTagSelector'
import { CsvDropzone } from '@/components/flashcards/CsvDropzone'
import { Topbar } from '@/components/admin/Topbar'
import { PageBody } from '@/components/ui/Page'
import { Card } from '@/components/ui/Card'
import { Field, controlClass } from '@/components/ui/Field'
import { Button, IconButton, buttonClass } from '@/components/ui/Button'
import { ErrorBanner } from '@/components/ui/ErrorBanner'
import { DiscardChangesDialog } from '@/components/ui/Dialog'
import { notifySuccess, notifyError } from '@/lib/toast'
import {
  BLANK_CARD, cardFieldKey, isNewFlashcardsDirty, validateNewFlashcards,
  type CardRow, type NewFlashcardsErrors,
} from '@/lib/flashcards/newFlashcards'

const MAX_SAMPLE_TEXT_CHARS = 20000
const GENERATE_COUNTS = [5, 10, 15, 20] as const
const BACK_HREF = '/admin/flashcards'

interface Listing {
  slug: string
  title: string
}

const textareaClass = `${controlClass} h-auto py-2 resize-y`

export default function NewFlashcardsPage() {
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)

  const [subject, setSubject] = useState('')
  const [topic, setTopic] = useState('')
  const [listings, setListings] = useState<Listing[]>([])
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])
  const [cards, setCards] = useState<CardRow[]>([{ ...BLANK_CARD }])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<NewFlashcardsErrors>({})
  const [submitAttempt, setSubmitAttempt] = useState(0)
  const [confirmLeave, setConfirmLeave] = useState(false)

  // AI generation state — separate from save state so the two actions don't
  // block each other and have their own error surfaces.
  const [generateCount, setGenerateCount] = useState<number>(10)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [formatNotes, setFormatNotes] = useState('')
  const [sampleText, setSampleText] = useState('')
  const [sampleFileName, setSampleFileName] = useState('')
  const [sampleFileError, setSampleFileError] = useState('')

  const values = { subject, topic, listingSlugs: selectedSlugs, cards, formatNotes, sampleText }
  const dirty = !saved && isNewFlashcardsDirty(values)

  useEffect(() => {
    fetch('/api/admin/listings')
      .then((res) => res.json())
      .then((data: unknown) => {
        if (Array.isArray(data)) {
          setListings(
            (data as Array<{ slug: string; title: string }>).map((l) => ({
              slug: l.slug,
              title: l.title,
            }))
          )
        }
      })
      .catch((err) => console.error('[new] listings fetch error:', err))
  }, [])

  // The browser's own "Leave site?" prompt while there is unsaved work.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  // After a failed submit, take focus to the first field that needs fixing.
  useEffect(() => {
    if (submitAttempt === 0) return
    const form = formRef.current
    const target =
      form?.querySelector<HTMLElement>(':is(input,textarea,select)[aria-invalid="true"]') ??
      form?.querySelector<HTMLElement>('fieldset[aria-invalid="true"] button')
    target?.focus()
  }, [submitAttempt])

  function clearFieldError(key: string) {
    setFieldErrors(prev => {
      if (!(key in prev)) return prev
      const next = { ...prev }
      delete next[key]
      return next
    })
  }

  function updateCard(index: number, field: keyof CardRow, value: string) {
    setCards((prev) =>
      prev.map((c, i) =>
        i === index ? { ...c, [field]: value } : c
      )
    )
    if (field !== 'explanation') clearFieldError(cardFieldKey(index, field))
  }

  function addCard() {
    setCards((prev) => [...prev, { ...BLANK_CARD }])
  }

  function removeCard(index: number) {
    setCards((prev) => prev.filter((_, i) => i !== index))
    // Card errors are keyed by position, which just shifted.
    setFieldErrors(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith('card-'))))
  }

  async function handleSampleFile(file: File) {
    setSampleFileError('')
    try {
      const text = await file.text()
      setSampleText(text.slice(0, MAX_SAMPLE_TEXT_CHARS))
      setSampleFileName(file.name)
    } catch {
      setSampleFileError('Could not read that file — try pasting the sample text instead.')
    }
  }

  // Generation only needs subject + topic (listings are optional but improve style targeting).
  const canGenerate = subject.trim().length > 0 && topic.trim().length > 0 && !isGenerating && !isSubmitting
  const hasCardContent = cards.some(c => c.question.trim() || c.answer.trim())

  async function handleGenerate() {
    if (!canGenerate) return
    setIsGenerating(true)
    setGenerateError('')
    try {
      const res = await fetch('/api/flashcards/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_name: subject.trim(),
          topic_name: topic.trim(),
          listing_slugs: selectedSlugs,
          count: generateCount,
          existing_questions: cards.map(c => c.question).filter(q => q.trim().length > 0),
          formatNotes: formatNotes.trim() || undefined,
          sampleText: sampleText.trim() || undefined,
        }),
      })
      const body = await res.json() as { cards?: CardRow[]; error?: string }
      if (!res.ok || !body.cards) {
        const message = body.error ?? 'Generation failed'
        setGenerateError(message)
        notifyError(message)
        return
      }
      // Append generated cards; if the only existing card is empty, replace it
      // so we don't leave a blank first row pinned at the top.
      setCards(prev => {
        const generated = body.cards!.map(c => ({
          question: c.question ?? '',
          answer: c.answer ?? '',
          explanation: c.explanation ?? '',
        }))
        const existingHasContent = prev.some(c => c.question.trim() || c.answer.trim() || c.explanation.trim())
        return existingHasContent ? [...prev, ...generated] : generated
      })
      notifySuccess(`${body.cards.length} card${body.cards.length === 1 ? '' : 's'} generated`)
    } catch {
      setGenerateError('Generation failed — check your connection')
      notifyError('Generation failed — check your connection')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (isSubmitting) return
    const errors = validateNewFlashcards(values)
    setFieldErrors(errors)
    if (Object.keys(errors).length > 0) {
      setSubmitAttempt(n => n + 1)
      return
    }
    setIsSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/flashcards/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject_name: subject.trim(),
          topic_name: topic.trim(),
          listing_slugs: selectedSlugs,
          cards: cards.map((c) => ({
            question: c.question,
            answer: c.answer,
            explanation: c.explanation,
          })),
        }),
      })
      if (res.ok) {
        setSaved(true)
        notifySuccess('Saved — AI is generating multiple-choice distractors in the background (~30s per card)')
        router.push(BACK_HREF)
      } else {
        const body = await res.json() as { error?: string }
        const message = body.error ?? 'Failed to save flashcards'
        setError(message)
        notifyError(message)
        setIsSubmitting(false)
      }
    } catch {
      setError('Failed to save — check your connection')
      notifyError('Failed to save — check your connection')
      setIsSubmitting(false)
    }
  }

  function guardLeave(e: MouseEvent<HTMLAnchorElement>) {
    if (!dirty) return
    e.preventDefault()
    setConfirmLeave(true)
  }

  return (
    <>
      <Topbar title="Add flashcards manually" />
      <PageBody intro="Write cards by hand or generate them with AI, tag the exams they belong to, then save. Distractors are generated after saving.">
        <form
          ref={formRef}
          noValidate
          onSubmit={handleSubmit}
          aria-label="New flashcards"
          className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,400px)_1fr]"
        >
          {/* Left column: metadata, AI generation and the save action. */}
          <div className="space-y-4 lg:sticky lg:top-4">
            <Card title="Subject and topic">
              <div className="space-y-3">
                <Field label="Subject" required error={fieldErrors.subject}>
                  {p => (
                    <input
                      {...p}
                      value={subject}
                      onChange={(e) => { setSubject(e.target.value); clearFieldError('subject') }}
                      placeholder="e.g. Science"
                      className={controlClass}
                    />
                  )}
                </Field>
                <Field label="Topic" required error={fieldErrors.topic}>
                  {p => (
                    <input
                      {...p}
                      value={topic}
                      onChange={(e) => { setTopic(e.target.value); clearFieldError('topic') }}
                      placeholder="e.g. Cell Biology"
                      className={controlClass}
                    />
                  )}
                </Field>
              </div>
            </Card>

            <Card
              title="Generate with AI"
              description="Gemini 2.5 Flash, tuned to Philippine entrance and scholarship exams (UPCAT, ACET, DOST-SEI, CHED). Generated cards are added to the list for review before saving."
            >
              <div className="space-y-3">
                <Field
                  label="Format instructions"
                  hint="Optional. Describe the exact question format you want."
                >
                  {p => (
                    <textarea
                      {...p}
                      value={formatNotes}
                      onChange={(e) => setFormatNotes(e.target.value)}
                      disabled={isGenerating}
                      rows={3}
                      placeholder="e.g. 4-option multiple choice, one paragraph reading passage per question"
                      className={textareaClass}
                    />
                  )}
                </Field>

                <Field
                  label="Sample questions to imitate"
                  hint="Optional. Paste sample questions, or load a .txt/.csv/.md file below."
                >
                  {p => (
                    <textarea
                      {...p}
                      value={sampleText}
                      onChange={(e) => { setSampleText(e.target.value.slice(0, MAX_SAMPLE_TEXT_CHARS)); setSampleFileName('') }}
                      disabled={isGenerating}
                      rows={3}
                      placeholder="Paste sample questions here"
                      className={textareaClass}
                    />
                  )}
                </Field>

                <div>
                  <CsvDropzone
                    onFileSelected={handleSampleFile}
                    disabled={isGenerating}
                    accept=".txt,.csv,.md,text/plain,text/csv,text/markdown"
                    label="Drop a .txt/.csv/.md sample file here or click to browse"
                    hint="Parsed locally in your browser — nothing is uploaded except the extracted text."
                    sampleHref=""
                  />
                  {sampleFileName && (
                    <p className="mt-1 text-xs text-ink-muted">Loaded: {sampleFileName} ({sampleText.length.toLocaleString()} chars)</p>
                  )}
                  {sampleFileError && (
                    <p role="alert" className="mt-1 text-xs font-medium text-danger">{sampleFileError}</p>
                  )}
                </div>

                <fieldset className="space-y-1">
                  <legend className="text-ui font-medium text-ink">Cards to generate</legend>
                  <div className="flex gap-2 pt-1">
                    {GENERATE_COUNTS.map((n) => {
                      const active = generateCount === n
                      return (
                        <button
                          key={n}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setGenerateCount(n)}
                          disabled={isGenerating}
                          className={`h-8 flex-1 rounded-sm border text-ui font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                            active
                              ? 'border-maroon bg-maroon-dim text-maroon'
                              : 'border-control bg-surface text-ink hover:bg-surface-hover'
                          }`}
                        >
                          {n}
                        </button>
                      )
                    })}
                  </div>
                </fieldset>

                <Button
                  onClick={handleGenerate}
                  disabled={!canGenerate}
                  loading={isGenerating}
                  className="w-full"
                  aria-describedby={!subject.trim() || !topic.trim() ? 'generate-needs' : undefined}
                >
                  {isGenerating
                    ? `Generating ${generateCount} cards…`
                    : hasCardContent
                      ? `Generate ${generateCount} more`
                      : `Generate ${generateCount} flashcards`}
                </Button>

                {(!subject.trim() || !topic.trim()) && (
                  <p id="generate-needs" className="text-center text-xs text-ink-muted">
                    Enter a subject and topic first.
                  </p>
                )}

                {generateError && (
                  <p role="alert" className="text-xs font-medium text-danger">{generateError}</p>
                )}
              </div>
            </Card>

            <Card title="Exam tags">
              <ExamTagSelector
                listings={listings}
                selected={selectedSlugs}
                onChange={(slugs) => { setSelectedSlugs(slugs); if (slugs.length > 0) clearFieldError('listings') }}
                required
                error={fieldErrors.listings}
              />
            </Card>

            <div className="space-y-3">
              {error && <ErrorBanner title="Couldn’t save the flashcards" message={error} />}
              <div className="flex items-center gap-2">
                <Button type="submit" variant="primary" loading={isSubmitting} className="flex-1">
                  {isSubmitting ? 'Saving…' : 'Save to Knowledge base'}
                </Button>
                <Link href={BACK_HREF} onClick={guardLeave} className={buttonClass({ variant: 'ghost' })}>
                  Cancel
                </Link>
              </div>
            </div>
          </div>

          {/* Right column: the cards being written. */}
          <Card
            title="Flashcards"
            description={`${cards.length} card${cards.length === 1 ? '' : 's'}`}
            flush
          >
            <ol className="divide-y divide-subtle">
              {cards.map((card, index) => (
                <li key={index} className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-ui font-semibold text-ink">Card {index + 1}</h3>
                    {cards.length > 1 && (
                      <IconButton
                        icon="trash"
                        label={`Remove card ${index + 1}`}
                        onClick={() => removeCard(index)}
                        className="hover:bg-danger-soft hover:text-danger-strong"
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                    <Field label="Question" required error={fieldErrors[cardFieldKey(index, 'question')]}>
                      {p => (
                        <textarea
                          {...p}
                          value={card.question}
                          onChange={(e) => updateCard(index, 'question', e.target.value)}
                          rows={3}
                          placeholder="Enter the question"
                          className={textareaClass}
                        />
                      )}
                    </Field>
                    <Field label="Answer" required error={fieldErrors[cardFieldKey(index, 'answer')]}>
                      {p => (
                        <textarea
                          {...p}
                          value={card.answer}
                          onChange={(e) => updateCard(index, 'answer', e.target.value)}
                          rows={3}
                          placeholder="Enter the answer"
                          className={textareaClass}
                        />
                      )}
                    </Field>
                  </div>

                  <Field label="Explanation" hint="Optional context shown after the student answers.">
                    {p => (
                      <textarea
                        {...p}
                        value={card.explanation}
                        onChange={(e) => updateCard(index, 'explanation', e.target.value)}
                        rows={2}
                        placeholder="Optional explanation or context"
                        className={textareaClass}
                      />
                    )}
                  </Field>
                </li>
              ))}
            </ol>
            <div className="border-t border-subtle p-4">
              <Button icon="plus" onClick={addCard} className="w-full">Add card</Button>
            </div>
          </Card>
        </form>
      </PageBody>

      <DiscardChangesDialog
        open={confirmLeave}
        onKeep={() => setConfirmLeave(false)}
        onDiscard={() => { setConfirmLeave(false); setSaved(true); router.push(BACK_HREF) }}
      />
    </>
  )
}
