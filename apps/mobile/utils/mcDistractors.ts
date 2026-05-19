export interface RawCard {
  id: string
  question: string
  answer: string
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
  return answer.replace(/^[A-D]\)\s*/, '').trim()
}

function parseEmbedded(card: RawCard): QuizQuestion | null {
  const m = card.question.match(/\bA\)\s*(.*?)\s+B\)\s*(.*?)\s+C\)\s*(.*?)\s+D\)\s*([\s\S]+?)$/)
  if (!m) return null
  const stem = card.question.replace(/\s+A\)\s[\s\S]*$/, '').trim()
  const options = [m[1]!.trim(), m[2]!.trim(), m[3]!.trim(), m[4]!.trim()]
  const letter = card.answer.match(/^([A-D])\)/)?.[1]
  if (!letter) return null
  const answerIndex = 'ABCD'.indexOf(letter)
  if (answerIndex === -1) return null
  return { id: card.id, stem, options, answerIndex, explanation: card.explanation, difficulty: card.difficulty }
}

/**
 * Converts every RawCard to a QuizQuestion.
 * Cards with embedded A)/B)/C)/D) options are parsed directly.
 * Plain Q+A cards get 3 distractors synthesised from other cards' answers.
 * Never filters — always returns one QuizQuestion per input card.
 */
export function buildQuizQuestions(cards: RawCard[]): QuizQuestion[] {
  return cards.map(card => {
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
