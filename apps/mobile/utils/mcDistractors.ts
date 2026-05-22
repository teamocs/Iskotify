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
      return {
        id: card.id,
        stem: card.question.trim(),
        options: card.aiOptions,
        answerIndex: card.aiCorrectIndex,
        explanation,
      }
    }

    // Priority 2: admin-stored options
    if (
      card.options && card.options.length === 4 &&
      card.correctAnswerIndex != null &&
      card.correctAnswerIndex >= 0 && card.correctAnswerIndex <= 3
    ) {
      return {
        id: card.id,
        stem: card.question.trim(),
        options: card.options,
        answerIndex: card.correctAnswerIndex,
        explanation,
      }
    }

    // Priority 3: embedded A)/A. parsing
    const embedded = parseEmbedded(card)
    if (embedded) return { ...embedded, explanation }

    // Priority 4: synthetic distractors from pool
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
      explanation,
    }
  })
}
