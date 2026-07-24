'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ExamTagSelector } from '@/components/flashcards/ExamTagSelector'
import { CsvDropzone } from '@/components/flashcards/CsvDropzone'
import { Topbar } from '@/components/admin/Topbar'

const MAX_SAMPLE_TEXT_CHARS = 20000

interface Listing {
  slug: string
  title: string
}

interface CardRow {
  question: string
  answer: string
  explanation: string
}

const BLANK_CARD: CardRow = { question: '', answer: '', explanation: '' }

export default function NewFlashcardsPage() {
  const router = useRouter()

  const [subject, setSubject] = useState('')
  const [topic, setTopic] = useState('')
  const [listings, setListings] = useState<Listing[]>([])
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([])
  const [cards, setCards] = useState<CardRow[]>([{ ...BLANK_CARD }])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  // AI generation state — separate from save state so the two actions don't
  // block each other and have their own error surfaces.
  const [generateCount, setGenerateCount] = useState<number>(10)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState('')
  const [formatNotes, setFormatNotes] = useState('')
  const [sampleText, setSampleText] = useState('')
  const [sampleFileName, setSampleFileName] = useState('')
  const [sampleFileError, setSampleFileError] = useState('')

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

  function updateCard(index: number, field: keyof CardRow, value: string) {
    setCards((prev) =>
      prev.map((c, i) =>
        i === index ? { ...c, [field]: value } : c
      )
    )
  }

  function addCard() {
    setCards((prev) => [...prev, { ...BLANK_CARD }])
  }

  function removeCard(index: number) {
    setCards((prev) => prev.filter((_, i) => i !== index))
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

  const isValid =
    subject.trim().length > 0 &&
    topic.trim().length > 0 &&
    selectedSlugs.length > 0 &&
    cards.every((c) => c.question.trim().length > 0 && c.answer.trim().length > 0) &&
    !isSubmitting

  // Generation only needs subject + topic (listings are optional but improve style targeting).
  const canGenerate = subject.trim().length > 0 && topic.trim().length > 0 && !isGenerating && !isSubmitting

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
        setGenerateError(body.error ?? 'Generation failed')
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
    } catch {
      setGenerateError('Generation failed — check your connection')
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleSubmit() {
    if (!isValid) return
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
        alert('Saved! AI is generating multiple-choice distractors in the background — they\'ll be ready for students within ~30 seconds per card.')
        router.push('/admin/flashcards')
      } else {
        const body = await res.json() as { error?: string }
        setError(body.error ?? 'Failed to save flashcards')
        setIsSubmitting(false)
      }
    } catch {
      setError('Failed to save — check your connection')
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <Topbar title="Add to Knowledgebase Manually" />
      <div className="flex-1 overflow-y-auto p-6">
        {/* Back link */}
        <Link
          href="/admin/flashcards"
          className="inline-block text-xs text-[#6e6e73] hover:text-[#1d1d1f] transition-colors mb-4"
        >
          ← Back to Knowledgebase
        </Link>

        {/* 2-column layout: metadata (sticky on desktop) on left, flashcards on right */}
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,400px)_1fr] gap-6 items-start">
          {/* LEFT COLUMN — Metadata + Save action */}
          <div className="space-y-5 lg:sticky lg:top-6">
            {/* Subject / Topic */}
            <div className="bg-white border border-[#e5e7eb] rounded-2xl p-4">
              <p className="text-[11px] font-bold text-[#800000] uppercase tracking-wider mb-3">
                Subject &amp; Topic
              </p>
              <div className="space-y-3">
                <div>
                  <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">
                    SUBJECT
                  </label>
                  <input
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="e.g. Science"
                    className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm w-full font-semibold text-[#1d1d1f] placeholder:font-normal placeholder:text-[#9ca3af] focus:outline-none focus:border-[#800000] transition-colors"
                  />
                </div>
                <div>
                  <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">
                    TOPIC
                  </label>
                  <input
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder="e.g. Cell Biology"
                    className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm w-full font-semibold text-[#1d1d1f] placeholder:font-normal placeholder:text-[#9ca3af] focus:outline-none focus:border-[#800000] transition-colors"
                  />
                </div>
              </div>
            </div>

            {/* AI generation */}
            <div className="bg-white border border-[#e5e7eb] rounded-2xl p-4">
              <div className="flex items-baseline justify-between mb-3">
                <p className="text-[11px] font-bold text-[#800000] uppercase tracking-wider">
                  Generate with AI
                </p>
                <span className="text-[10px] text-[#9ca3af]">Gemini 2.5 Flash</span>
              </div>
              <p className="text-[11px] text-[#6e6e73] mb-3 leading-relaxed">
                Auto-generate flashcards tuned to Philippine entrance / scholarship exam standards
                (UPCAT, ACET, DOST-SEI, CHED, etc.). Cards are appended to the list below for your review before saving.
              </p>

              <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">
                FORMAT INSTRUCTIONS <span className="font-normal text-[#9ca3af]">(optional)</span>
              </label>
              <textarea
                value={formatNotes}
                onChange={(e) => setFormatNotes(e.target.value)}
                disabled={isGenerating}
                rows={3}
                placeholder="Describe the exact question format you want, e.g. &quot;4-option multiple choice, one paragraph reading passage per question&quot;"
                className="border border-[#d1d5db] rounded-lg px-3 py-2 text-xs w-full text-[#1d1d1f] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#800000] transition-colors resize-y mb-3 disabled:opacity-50"
              />

              <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">
                SAMPLE QUESTIONS TO IMITATE <span className="font-normal text-[#9ca3af]">(optional)</span>
              </label>
              <textarea
                value={sampleText}
                onChange={(e) => { setSampleText(e.target.value.slice(0, MAX_SAMPLE_TEXT_CHARS)); setSampleFileName('') }}
                disabled={isGenerating}
                rows={3}
                placeholder="Paste sample questions here, or upload a .txt/.csv/.md file below"
                className="border border-[#d1d5db] rounded-lg px-3 py-2 text-xs w-full text-[#1d1d1f] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#800000] transition-colors resize-y mb-2 disabled:opacity-50"
              />
              <div className="mb-3">
                <CsvDropzone
                  onFileSelected={handleSampleFile}
                  disabled={isGenerating}
                  accept=".txt,.csv,.md,text/plain,text/csv,text/markdown"
                  label="Drop a .txt/.csv/.md sample file here or click to browse"
                  hint="Parsed locally in your browser — nothing is uploaded except the extracted text."
                  sampleHref=""
                />
                {sampleFileName && (
                  <p className="text-[10px] text-[#6e6e73] mt-1">Loaded: {sampleFileName} ({sampleText.length.toLocaleString()} chars)</p>
                )}
                {sampleFileError && (
                  <p className="text-[10px] text-[#800000] mt-1">{sampleFileError}</p>
                )}
              </div>

              <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">
                HOW MANY CARDS?
              </label>
              <div className="flex gap-2 mb-3">
                {[5, 10, 15, 20].map((n) => {
                  const active = generateCount === n
                  return (
                    <button
                      key={n}
                      onClick={() => setGenerateCount(n)}
                      disabled={isGenerating}
                      className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-semibold transition-colors border ${
                        active
                          ? 'bg-[#800000] text-white border-[#800000]'
                          : 'bg-white text-[#1d1d1f] border-[#d1d5db] hover:border-[#800000]'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      {n}
                    </button>
                  )
                })}
              </div>

              <button
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="w-full px-4 py-2.5 bg-[#1d1d1f] text-white text-sm font-semibold rounded-full hover:bg-[#000] transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isGenerating ? (
                  <>
                    <span className="inline-block w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    Generating {generateCount} cards…
                  </>
                ) : cards.some(c => c.question.trim() || c.answer.trim()) ? (
                  <>+ Generate {generateCount} more</>
                ) : (
                  <>✨ Generate {generateCount} flashcards</>
                )}
              </button>

              {!subject.trim() || !topic.trim() ? (
                <p className="text-[10px] text-[#9ca3af] mt-2 text-center">
                  Enter Subject and Topic first.
                </p>
              ) : null}

              {generateError && (
                <p className="text-[11px] text-[#800000] font-medium mt-2">{generateError}</p>
              )}
            </div>

            {/* Exam Tags */}
            <ExamTagSelector
              listings={listings}
              selected={selectedSlugs}
              onChange={setSelectedSlugs}
            />

            {/* Error + Submit (sticky bottom of left column) */}
            <div className="space-y-3">
              {error && (
                <p className="text-xs text-[#800000] font-medium">{error}</p>
              )}
              <button
                onClick={handleSubmit}
                disabled={!isValid}
                className="w-full px-6 py-2.5 bg-[#800000] text-white text-sm font-semibold rounded-full hover:bg-[#6b0000] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {isSubmitting ? 'Saving…' : 'Save to Knowledgebase'}
              </button>
            </div>
          </div>

          {/* RIGHT COLUMN — Flashcards list */}
          <div className="space-y-3 min-w-0">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-[#800000] uppercase tracking-wider">
                Flashcards
              </p>
              <span className="text-[11px] text-[#6e6e73] font-medium">
                {cards.length} card{cards.length === 1 ? '' : 's'}
              </span>
            </div>

            {cards.map((card, index) => (
              <div
                key={index}
                className="bg-white border border-[#e5e7eb] rounded-2xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] font-semibold text-[#6e6e73]">
                    CARD {index + 1}
                  </span>
                  {cards.length > 1 && (
                    <button
                      onClick={() => removeCard(index)}
                      className="text-[11px] text-[#6e6e73] hover:text-[#800000] transition-colors font-medium"
                    >
                      Remove
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">
                      QUESTION
                    </label>
                    <textarea
                      value={card.question}
                      onChange={(e) => updateCard(index, 'question', e.target.value)}
                      rows={3}
                      placeholder="Enter the question"
                      className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm w-full text-[#1d1d1f] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#800000] transition-colors resize-y"
                    />
                  </div>

                  <div>
                    <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">
                      ANSWER
                    </label>
                    <textarea
                      value={card.answer}
                      onChange={(e) => updateCard(index, 'answer', e.target.value)}
                      rows={3}
                      placeholder="Enter the answer"
                      className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm w-full text-[#1d1d1f] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#800000] transition-colors resize-y"
                    />
                  </div>
                </div>

                <div>
                  <label className="text-[11px] text-[#6e6e73] font-semibold block mb-1">
                    EXPLANATION <span className="font-normal text-[#9ca3af]">(optional)</span>
                  </label>
                  <textarea
                    value={card.explanation}
                    onChange={(e) => updateCard(index, 'explanation', e.target.value)}
                    rows={2}
                    placeholder="Optional explanation or context"
                    className="border border-[#d1d5db] rounded-lg px-3 py-2 text-sm w-full text-[#1d1d1f] placeholder:text-[#9ca3af] focus:outline-none focus:border-[#800000] transition-colors resize-y"
                  />
                </div>
              </div>
            ))}

            <button
              onClick={addCard}
              className="w-full py-2.5 border border-dashed border-[#d1d5db] rounded-xl text-xs font-semibold text-[#6e6e73] hover:border-[#800000] hover:text-[#800000] transition-colors"
            >
              + Add card
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
