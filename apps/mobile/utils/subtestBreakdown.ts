export interface SubtestRow {
  name: string
  correct: number
  total: number
  /** Rounded percent correct (0–100). */
  pct: number
}

/** Per-subtest (section) raw score, in the order sections first appear. Pure. */
export function subtestBreakdown(
  questions: ReadonlyArray<{ sectionName: string; q: { correctIndex: number } }>,
  answers: Record<number, number>,
): SubtestRow[] {
  const order: string[] = []
  const by = new Map<string, { correct: number; total: number }>()
  questions.forEach((fq, i) => {
    let cur = by.get(fq.sectionName)
    if (!cur) {
      cur = { correct: 0, total: 0 }
      by.set(fq.sectionName, cur)
      order.push(fq.sectionName)
    }
    cur.total++
    if (answers[i] === fq.q.correctIndex) cur.correct++
  })
  return order.map(name => {
    const b = by.get(name)!
    return { name, correct: b.correct, total: b.total, pct: b.total ? Math.round((b.correct / b.total) * 100) : 0 }
  })
}

/**
 * The subtest to practise next: the lowest percent (first on a tie). Null when
 * there is only one subtest (nothing to choose between) or every one is perfect.
 */
export function nextFocusSubtest(rows: readonly SubtestRow[]): string | null {
  if (rows.length < 2) return null
  let lowest = rows[0]!
  for (const r of rows) if (r.pct < lowest.pct) lowest = r
  return lowest.pct >= 100 ? null : lowest.name
}
