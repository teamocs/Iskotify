export interface LegacyMcqResult {
  stem: string
  options: [string, string, string, string]
  correctIndex: number  // 0–3
}

interface LegacyMcqInput {
  question: string
  answer: string
}

/**
 * Parse questions with inline A./B./C./D. or A)/B)/C)/D) format into structured
 * fields. Returns null if the question isn't recognized as embedded MCQ OR if
 * the answer column doesn't match one of the parsed options.
 *
 * Port of `parseEmbedded` in apps/mobile/utils/mcDistractors.ts.
 */
export function parseLegacyEmbeddedMcq(input: LegacyMcqInput): LegacyMcqResult | null {
  const { question, answer } = input

  // Match A./A) ... B./B) ... C./C) ... D./D) ... — same regex as mobile mcDistractors.parseEmbedded
  const m = question.match(/\bA[.)]\s*(.*?)\s+B[.)]\s*(.*?)\s+C[.)]\s*(.*?)\s+D[.)]\s*([\s\S]+?)$/)
  if (!m) return null

  const stem = question.replace(/\s+A[.)]\s[\s\S]*$/, '').trim()
  const options: [string, string, string, string] = [
    m[1]!.trim(), m[2]!.trim(), m[3]!.trim(), m[4]!.trim(),
  ]

  // The answer column should start with "A.", "A)", "B.", "B)", etc.
  const letter = answer.match(/^([A-D])[.)]/)?.[1]
  if (!letter) return null

  const correctIndex = 'ABCD'.indexOf(letter)
  if (correctIndex === -1) return null

  // Sanity check: strip the answer's letter prefix and compare to the option
  // at correctIndex. If they don't match, the legacy data is inconsistent
  // (e.g. answer "C. Mitochondria" but option C is something else).
  const answerText = answer.replace(/^[A-D][.)]\s*/, '').trim()
  const optionAtIndex = options[correctIndex]
  if (!optionAtIndex || answerText.toLowerCase() !== optionAtIndex.toLowerCase()) {
    return null
  }

  return { stem, options, correctIndex }
}
