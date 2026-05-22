export interface RawCard {
  id: string
  question: string
  answer: string
  options?: string[]           // stored: 4 option texts, no letter prefix
  correctAnswerIndex?: number  // stored: 0–3
  explanation: string
  difficulty: number
}

export interface QuizQuestion {
  id: string
  stem: string
  options: string[]    // 4 answer texts, no letter prefix
  answerIndex: number  // 0–3
  explanation: string
  difficulty: number
}

const FALLBACKS = ['Cannot be determined', 'None of the above', 'All of the above']

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = a[i] as T; a[i] = a[j] as T; a[j] = tmp
  }
  return a
}

function stripPrefix(answer: string): string {
  return answer.replace(/^[A-D][.)]\s*/, '').trim()
}

// Handles both "A)" and "A." label formats, with options on same line or new lines
function parseEmbedded(card: RawCard): QuizQuestion | null {
  const m = card.question.match(/\bA[.)]\s*(.*?)\s+B[.)]\s*(.*?)\s+C[.)]\s*(.*?)\s+D[.)]\s*([\s\S]+?)$/)
  if (!m) return null
  const stem = card.question.replace(/\s+A[.)]\s[\s\S]*$/, '').trim()
  const options = [m[1]!.trim(), m[2]!.trim(), m[3]!.trim(), m[4]!.trim()]
  const letter = card.answer.match(/^([A-D])[.)]/)?.[1]
  if (!letter) return null
  const answerIndex = 'ABCD'.indexOf(letter)
  if (answerIndex === -1) return null
  return { id: card.id, stem, options, answerIndex, explanation: card.explanation, difficulty: card.difficulty }
}

/**
 * Converts every RawCard to a QuizQuestion.
 * Priority 1: stored options (new seeded flashcards with options[] + correctAnswerIndex).
 * Priority 2: embedded A)/A. parsing.
 * Priority 3: synthetic distractors from pool.
 */
export function buildQuizQuestions(cards: RawCard[]): QuizQuestion[] {
  return cards.map(card => {
    // Priority 1: pre-stored options — no parsing needed
    if (card.options && card.options.length === 4 && card.correctAnswerIndex !== undefined) {
      return {
        id: card.id,
        stem: card.question.trim(),
        options: card.options,
        answerIndex: card.correctAnswerIndex,
        explanation: card.explanation,
        difficulty: card.difficulty,
      }
    }

    const embedded = parseEmbedded(card)
    if (embedded) return embedded

    const correct = stripPrefix(card.answer)
    const pool = cards
      .filter(c => c.id !== card.id)
      .map(c => stripPrefix(c.answer))
      .filter(a => a.length > 0 && a.toLowerCase() !== correct.toLowerCase())
    const unique = [...new Set(pool)]
    const distractors = shuffle(unique).slice(0, 3)

    let fi = 0
    while (distractors.length < 3) {
      const fb = FALLBACKS[fi % FALLBACKS.length]!
      if (!distractors.includes(fb)) distractors.push(fb)
      fi++
    }

    const all = shuffle([correct, ...distractors.slice(0, 3)])
    return {
      id: card.id,
      stem: card.question.trim(),
      options: all,
      answerIndex: Math.max(0, all.indexOf(correct)),
      explanation: card.explanation,
      difficulty: card.difficulty,
    }
  })
}
