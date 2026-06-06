export const SUBTESTS = ['Mathematics', 'Science', 'Language Proficiency', 'Reading Comprehension'] as const
export type Subtest = typeof SUBTESTS[number]

export interface RawUpcatQuestion {
  questionId: string; subtest: string; questionText: string; options: string[]
  correctIndex: number; explanation: string; setId: string | null; setPosition: number | null
}
export interface RawUpcatPassage { setId: string; subtest: string; passageText: string }
export interface ExamQuestion extends RawUpcatQuestion { passageText: string | null }

const QUICK_TARGET = 15
const QUICK_MAX = 20

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!] }
  return a
}

export function buildExam(
  questions: RawUpcatQuestion[],
  passages: RawUpcatPassage[],
  opts: { subtest: Subtest; mode: 'quick' | 'full' },
): ExamQuestion[] {
  const passageById = new Map(passages.map(p => [p.setId, p.passageText]))
  const inSubtest = questions.filter(q => q.subtest === opts.subtest)

  const setGroups = new Map<string, RawUpcatQuestion[]>()
  const standalone: RawUpcatQuestion[] = []
  for (const q of inSubtest) {
    if (q.setId) {
      if (!setGroups.has(q.setId)) setGroups.set(q.setId, [])
      setGroups.get(q.setId)!.push(q)
    } else standalone.push(q)
  }
  for (const g of setGroups.values()) g.sort((a, b) => (a.setPosition ?? 0) - (b.setPosition ?? 0))

  type Unit = RawUpcatQuestion[]
  const units: Unit[] = [...standalone.map(q => [q]), ...setGroups.values()]

  let chosen: Unit[]
  if (opts.mode === 'full') {
    chosen = units
  } else {
    const picked: Unit[] = []
    let count = 0
    for (const u of shuffle(units)) {
      if (count >= QUICK_TARGET) break
      if (count + u.length > QUICK_MAX) continue
      picked.push(u); count += u.length
    }
    if (picked.length === 0 && units.length) { picked.push(units[0]!) }
    chosen = picked
  }

  return chosen.flat().map(q => ({ ...q, passageText: q.setId ? (passageById.get(q.setId) ?? null) : null }))
}

export interface ScoredAnswer { subtest: string; correct: boolean }
export function scoreExam(answers: ScoredAnswer[]): {
  overall: { correct: number; total: number }
  bySubtest: Record<string, { correct: number; total: number }>
} {
  const bySubtest: Record<string, { correct: number; total: number }> = {}
  let correct = 0
  for (const a of answers) {
    if (!bySubtest[a.subtest]) bySubtest[a.subtest] = { correct: 0, total: 0 }
    bySubtest[a.subtest]!.total++
    if (a.correct) { bySubtest[a.subtest]!.correct++; correct++ }
  }
  return { overall: { correct, total: answers.length }, bySubtest }
}
