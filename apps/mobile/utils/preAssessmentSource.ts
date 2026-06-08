import type { PreAssessQuestion } from '../data/preAssessment'

// Local upcat_questions row shape (subset used to build a pre-assessment).
export interface UpcatLocalRow {
  questionId: string
  subtest: string
  questionText: string
  options: string // JSON-encoded string[]
  correctIndex: number
  explanation: string | null
  setId: string | null
}

function parseOptions(json: string): string[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.map(String) : []
  } catch {
    return []
  }
}

function shuffle<T>(arr: T[], rng: () => number): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = a[i] as T; a[i] = a[j] as T; a[j] = tmp
  }
  return a
}

/**
 * Build a pre-assessment from the exam-tagged question bank (local upcat_questions),
 * filtered to the subtests relevant to the user's selected exams. Standalone
 * (non-passage) questions only — the pre-assessment UI has no passage panel.
 * Returns up to `perSubtest` questions per subtest. Empty array → caller should
 * fall back to the bundled static questions.
 */
export function buildPreAssessFromUpcat(
  rows: UpcatLocalRow[],
  subtests: string[],
  perSubtest = 3,
  rng: () => number = Math.random,
): PreAssessQuestion[] {
  const wanted = new Set(subtests)
  const bySubtest = new Map<string, UpcatLocalRow[]>()
  for (const r of rows) {
    if (r.setId) continue // skip passage-linked questions (need a passage panel)
    if (!wanted.has(r.subtest)) continue
    const opts = parseOptions(r.options)
    if (opts.length < 2) continue
    if (r.correctIndex < 0 || r.correctIndex >= opts.length) continue
    const list = bySubtest.get(r.subtest) ?? []
    list.push(r)
    bySubtest.set(r.subtest, list)
  }
  const out: PreAssessQuestion[] = []
  for (const st of subtests) {
    const pool = bySubtest.get(st)
    if (!pool || pool.length === 0) continue
    for (const r of shuffle(pool, rng).slice(0, perSubtest)) {
      out.push({
        id: r.questionId,
        subject: r.subtest,
        stem: r.questionText,
        options: parseOptions(r.options),
        answerIndex: r.correctIndex,
        explanation: r.explanation ?? '',
      })
    }
  }
  return out
}
