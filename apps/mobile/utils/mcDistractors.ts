export function safeParseOptions(s: string | null | undefined): string[] {
  try { const v = JSON.parse(s ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

export interface RawCard {
  id: string
  question: string
  answer: string
  options?: string[] | null
  correctAnswerIndex?: number | null
  explanation: string
  aiOptions?: string[] | null
  aiCorrectIndex?: number | null
  aiExplanation?: string | null
}

export interface QuizQuestion {
  id: string
  stem: string
  options: string[]
  answerIndex: number
  explanation: string
}

// Generic, topic-agnostic placeholders used when a card has no admin-set
// options, no AI-generated options, and no embedded MCQ format. Previous
// behavior pulled distractors from OTHER cards' answers in the same deck,
// which produced misleading non-sequiturs (e.g. a Biology card getting
// a Philippine-history date as a "wrong answer"). Honest placeholders are
// always better than misleadingly attached real-but-unrelated content.
const FALLBACKS = [
  'Cannot be determined',
  'None of the above',
  'More information needed',
]

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i] as T; a[i] = a[j] as T; a[j] = tmp
  }
  return a
}

function shuffleWithIndex(opts: string[], correctIdx: number): { options: string[]; correctIndex: number } {
  const a = [...opts]
  let cIdx = correctIdx
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i] as string; a[i] = a[j] as string; a[j] = tmp
    if (i === cIdx) cIdx = j
    else if (j === cIdx) cIdx = i
  }
  return { options: a, correctIndex: cIdx }
}

function stripPrefix(answer: string): string {
  return answer.replace(/^[A-D][.)]\s*/, '').trim()
}

function parseEmbedded(card: RawCard): QuizQuestion | null {
  const m = card.question.match(/\bA[.)]\s*(.*?)\s+B[.)]\s*(.*?)\s+C[.)]\s*(.*?)\s+D[.)]\s*([\s\S]+?)$/)
  if (!m) return null
  const stem = card.question.replace(/\s+A[.)]\s[\s\S]*$/, '').trim()
  const options = [m[1]!.trim(), m[2]!.trim(), m[3]!.trim(), m[4]!.trim()]
  const letter = card.answer.match(/^([A-D])[.)]/)?.[1]
  if (!letter) return null
  const answerIndex = 'ABCD'.indexOf(letter)
  if (answerIndex === -1) return null
  return {
    id: card.id,
    stem,
    options,
    answerIndex,
    explanation: '',  // caller applies the aiExplanation ?? explanation precedence
  }
}

export function buildQuizQuestions(cards: RawCard[]): QuizQuestion[] {
  return cards.map(card => {
    const explanation = card.aiExplanation ?? card.explanation

    // Priority 1: AI-generated options
    if (
      card.aiOptions && card.aiOptions.length === 4 &&
      card.aiCorrectIndex != null &&
      card.aiCorrectIndex >= 0 && card.aiCorrectIndex <= 3
    ) {
      {
        const { options, correctIndex } = shuffleWithIndex(card.aiOptions, card.aiCorrectIndex)
        return {
          id: card.id,
          stem: card.question.trim(),
          options,
          answerIndex: correctIndex,
          explanation,
        }
      }
    }

    // Priority 2: admin-stored options
    if (
      card.options && card.options.length === 4 &&
      card.correctAnswerIndex != null &&
      card.correctAnswerIndex >= 0 && card.correctAnswerIndex <= 3
    ) {
      {
        const { options, correctIndex } = shuffleWithIndex(card.options, card.correctAnswerIndex)
        return {
          id: card.id,
          stem: card.question.trim(),
          options,
          answerIndex: correctIndex,
          explanation,
        }
      }
    }

    // Priority 3: embedded A)/A. parsing
    const embedded = parseEmbedded(card)
    if (embedded) {
      const { options, correctIndex } = shuffleWithIndex(embedded.options, embedded.answerIndex)
      return { ...embedded, options, answerIndex: correctIndex, explanation }
    }

    // Priority 4: safe placeholder distractors
    //
    // Reached only when the LLM hasn't enhanced this card yet AND it has no
    // admin-set options AND no embedded MCQ format. Practice screens should
    // call enhanceCardsByIds() before reaching this state — this is the
    // last-resort fallback for cards enhancement couldn't reach (model not
    // downloaded, model rejected the card, etc.).
    //
    // We deliberately use generic placeholders rather than pulling distractors
    // from other cards' answers — the latter produces misleading non-sequiturs.
    const correct = stripPrefix(card.answer)
    const all = shuffle([correct, ...FALLBACKS.slice(0, 3)])
    return {
      id: card.id,
      stem: card.question.trim(),
      options: all,
      answerIndex: Math.max(0, all.indexOf(correct)),
      explanation,
    }
  })
}
