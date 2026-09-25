// Exam safety Fix 1 — pure helpers for persisting/restoring an in-progress
// timed run (mock exam, UPCAT subtest, diagnostic). Kept DB-agnostic and pure
// so the reconstruction logic is unit-tested without SQLite: the DB-backed
// read/write lives in services/examRuns.ts.

export type ExamRunKind = 'exam' | 'upcat' | 'diagnostic'

/** Stable key for one in-progress run, e.g. 'exam:upcat', 'upcat:all:full'. */
export function runKeyFor(kind: ExamRunKind, slug: string, mode: string = ''): string {
  return mode ? `${kind}:${slug}:${mode}` : `${kind}:${slug}`
}

/**
 * Reorder (and filter) a freshly-fetched question pool to match a saved id
 * order. Ids no longer present in the pool (e.g. the question was
 * unpublished since the run was saved) are silently dropped — resuming with
 * fewer questions than started is safer than resuming with a stale/missing one.
 */
export function reorderByIds<T, K extends keyof T>(pool: readonly T[], ids: readonly string[], idKey: K): T[] {
  const byId = new Map<string, T>()
  for (const item of pool) byId.set(String(item[idKey]), item)
  const out: T[] = []
  for (const id of ids) {
    const item = byId.get(id)
    if (item) out.push(item)
  }
  return out
}

/** JSON.parse that never throws — falls back on null/undefined/invalid input. */
export function safeParseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try {
    const v = JSON.parse(raw)
    return (v ?? fallback) as T
  } catch {
    return fallback
  }
}

/**
 * Review finding #1 (HIGH) — reorderByIds() drops ids no longer in the pool
 * and COMPACTS the survivors, so an answers/flags record keyed by the
 * ORIGINAL flat index would land on the wrong question the moment anything
 * earlier in the list vanished. Remap every entry through the id each old
 * index pointed to: an entry whose question vanished is dropped (there is
 * nothing sane to remap it onto); everything else lands on its new
 * (compacted) index.
 */
export function remapIndexedById<T>(
  originalIds: readonly string[],
  newIds: readonly string[],
  byOldIndex: Readonly<Record<number, T>>,
): Record<number, T> {
  const newIndexById = new Map(newIds.map((id, i) => [id, i]))
  const out: Record<number, T> = {}
  for (const [oldIdxStr, value] of Object.entries(byOldIndex)) {
    const oldIdx = Number(oldIdxStr)
    const id = originalIds[oldIdx]
    if (id == null) continue
    const newIdx = newIndexById.get(id)
    if (newIdx !== undefined) out[newIdx] = value
  }
  return out
}

/**
 * Same id-based remap as remapIndexedById(), but for a single scalar index
 * (the resumed run's current question / floor position) rather than a whole
 * record. When the question at `oldIdx` itself vanished, there is no exact
 * answer — clamp into the surviving range instead of resuming out of bounds
 * or crashing.
 */
export function remapSingleIndex(originalIds: readonly string[], newIds: readonly string[], oldIdx: number): number {
  const newIndexById = new Map(newIds.map((id, i) => [id, i]))
  const id = originalIds[oldIdx]
  const exact = id != null ? newIndexById.get(id) : undefined
  if (exact !== undefined) return exact
  return Math.max(0, Math.min(oldIdx, newIds.length - 1))
}

export interface ReconstructedBuiltExam<Section, Q> {
  runnable: { section: Section; questions: Q[]; available: number }[]
  comingSoon: Section[]
  totalQuestions: number
}

/**
 * Rebuild a BuiltExam-shaped object (see utils/examBuilder.ts's BuiltExam)
 * from a resumed FLAT question list, grouping consecutive same-sectionName
 * runs and matching each group back to the blueprint's own section metadata
 * by name — app/practice/exam/[slug].tsx's section-blocked timing needs
 * `runnable[].section` metadata that a flat list alone doesn't carry.
 * A group whose name no longer matches any current blueprint section (e.g.
 * the blueprint was edited) is dropped rather than guessed at.
 */
export function reconstructBuiltExamFromRun<Section extends { name: string }, Q>(
  sections: readonly Section[],
  flatQuestions: readonly { q: Q; sectionName: string }[],
): ReconstructedBuiltExam<Section, Q> {
  const byName = new Map(sections.map(s => [s.name, s]))
  const runnable: { section: Section; questions: Q[]; available: number }[] = []

  let currentName: string | null = null
  let currentGroup: Q[] = []

  const flush = () => {
    if (currentName == null || currentGroup.length === 0) return
    const section = byName.get(currentName)
    if (section) runnable.push({ section, questions: currentGroup, available: currentGroup.length })
  }

  for (const fq of flatQuestions) {
    if (fq.sectionName !== currentName) {
      flush()
      currentName = fq.sectionName
      currentGroup = []
    }
    currentGroup.push(fq.q)
  }
  flush()

  const usedNames = new Set(runnable.map(r => r.section.name))
  const comingSoon = sections.filter(s => !usedNames.has(s.name))
  const totalQuestions = runnable.reduce((n, r) => n + r.questions.length, 0)
  return { runnable, comingSoon, totalQuestions }
}
