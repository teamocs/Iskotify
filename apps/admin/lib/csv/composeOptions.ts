export interface ComposedOptions {
  options: string[]
  correctIndex: number
}

/**
 * Combine the answer with exactly 3 distractors into a 4-option array, shuffled
 * deterministically by `seed` so the same question always produces the same option
 * order across devices/sessions.
 */
export function composeOptions(answer: string, distractors: string[], seed: string): ComposedOptions {
  if (distractors.length !== 3) {
    throw new Error(`composeOptions: distractors must have exactly 3 entries, got ${distractors.length}`)
  }
  const all = [answer, ...distractors]
  const rng = mulberry32(hashString(seed))
  const shuffled = [...all]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!]
  }
  return { options: shuffled, correctIndex: shuffled.indexOf(answer) }
}

function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) h = (h * 33) ^ s.charCodeAt(i)
  return h >>> 0
}

function mulberry32(a: number): () => number {
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
