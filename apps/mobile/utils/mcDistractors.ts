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
  /**
   * Index-aligned with WHICHEVER option array is actually served for this
   * card (aiOptions when present, else options) — null at the correct index.
   * Task E — "why this option is wrong". Threaded through both branches of
   * buildQuizQuestions below and re-permuted alongside whichever options
   * array gets shuffled.
   */
  optionExplanations?: (string | null)[] | null
  /** Optional short formula/mnemonic/pacing tip. Task E. */
  strategyTip?: string | null
  /** Question-media (diagram/infographic/comic-panel/chart), independent of which
   *  options branch below is chosen — carried straight through to QuizQuestion. */
  imageUrl?: string | null
  imageAlt?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
}

export interface QuizQuestion {
  id: string
  stem: string
  options: string[]
  answerIndex: number
  explanation: string
  /** Index-aligned with `options` above (post-shuffle); null at answerIndex. Task E. */
  optionExplanations?: (string | null)[]
  strategyTip?: string
  imageUrl?: string | null
  imageAlt?: string | null
  imageWidth?: number | null
  imageHeight?: number | null
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

/**
 * Shuffles `opts` (Fisher-Yates), tracking where the correct answer landed.
 * When `aux` is provided (Task E's optionExplanations, aligned to the PRE-
 * shuffle `opts` order), it is permuted through the exact same swaps so the
 * "why this option is wrong" text stays attached to the option it describes.
 */
function shuffleWithIndex(
  opts: string[],
  correctIdx: number,
  aux?: (string | null)[] | null,
): { options: string[]; correctIndex: number; aux: (string | null)[] | undefined } {
  const a = [...opts]
  const b = aux ? [...aux] : undefined
  let cIdx = correctIdx
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i] as string; a[i] = a[j] as string; a[j] = tmp
    if (b) { const tmpB = b[i] ?? null; b[i] = b[j] ?? null; b[j] = tmpB }
    if (i === cIdx) cIdx = j
    else if (j === cIdx) cIdx = i
  }
  return { options: a, correctIndex: cIdx, aux: b }
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
    const strategyTip = card.strategyTip?.trim() || undefined
    // Independent of which options branch below fires — a card's figure isn't
    // tied to whether its options came from AI/admin/embedded/placeholder.
    const imageFields = {
      imageUrl: card.imageUrl ?? null,
      imageAlt: card.imageAlt ?? null,
      imageWidth: card.imageWidth ?? null,
      imageHeight: card.imageHeight ?? null,
    }

    // Priority 1: AI-generated options
    if (
      card.aiOptions && card.aiOptions.length === 4 &&
      card.aiCorrectIndex != null &&
      card.aiCorrectIndex >= 0 && card.aiCorrectIndex <= 3
    ) {
      {
        // optionExplanations is stored index-aligned with WHICHEVER option
        // array it was generated alongside — for AI-enhanced cards that's
        // aiOptions (see admin's lib/gemini/generateDistractors.ts), so it's
        // paired with aiOptions/aiCorrectIndex here.
        const { options, correctIndex, aux } = shuffleWithIndex(card.aiOptions, card.aiCorrectIndex, card.optionExplanations)
        return {
          id: card.id,
          stem: card.question.trim(),
          options,
          answerIndex: correctIndex,
          explanation,
          optionExplanations: aux,
          strategyTip,
          ...imageFields,
        }
      }
    }

    // Priority 2: admin-stored options. Unlike aiOptions above (Gemini-generated,
    // always exactly 4 by construction — a different length there means bad AI
    // data, so it falls through), admin/imported options are legitimately
    // variable-length: the CSV importer drops a blank 4th option, and questions
    // projected from the question bank (project_question_bank_to_flashcards)
    // can carry 3-option upcat_questions as-is. Requiring >= 2 (so there's at
    // least one distractor) keeps those real options instead of discarding them
    // for FALLBACKS placeholders. OptionList/QuestionCard/ReviewCard already
    // render any options.length correctly.
    if (
      card.options && card.options.length >= 2 &&
      card.correctAnswerIndex != null &&
      card.correctAnswerIndex >= 0 && card.correctAnswerIndex < card.options.length
    ) {
      {
        const { options, correctIndex, aux } = shuffleWithIndex(card.options, card.correctAnswerIndex, card.optionExplanations)
        return {
          id: card.id,
          stem: card.question.trim(),
          options,
          answerIndex: correctIndex,
          explanation,
          optionExplanations: aux,
          strategyTip,
          ...imageFields,
        }
      }
    }

    // Priority 3: embedded A)/A. parsing
    const embedded = parseEmbedded(card)
    if (embedded) {
      const { options, correctIndex } = shuffleWithIndex(embedded.options, embedded.answerIndex)
      return { ...embedded, options, answerIndex: correctIndex, explanation, ...imageFields }
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
      ...imageFields,
    }
  })
}
