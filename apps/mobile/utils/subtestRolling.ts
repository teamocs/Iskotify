export type RollingSession = {
  subtest: string
  score: number
  total: number
  completedAt: number
}

type SubtestKey = 'math' | 'reading' | 'language' | 'science'

const SUBTEST_MAP: Record<string, SubtestKey> = {
  'Mathematics': 'math',
  'Reading Comprehension': 'reading',
  'Language Proficiency': 'language',
  'Science': 'science',
}

export function rollingSubtestAverages(
  sessions: RollingSession[],
  n = 3,
): Record<SubtestKey, number | null> {
  const result: Record<SubtestKey, number | null> = {
    math: null,
    reading: null,
    language: null,
    science: null,
  }

  for (const [subtestName, key] of Object.entries(SUBTEST_MAP)) {
    const valid = sessions
      .filter(s => s.subtest === subtestName && s.total > 0)
      .sort((a, b) => b.completedAt - a.completedAt)
      .slice(0, n)

    if (valid.length === 0) continue

    const avg = valid.reduce((sum, s) => sum + (s.score / s.total) * 100, 0) / valid.length
    result[key] = Math.round(avg)
  }

  return result
}
