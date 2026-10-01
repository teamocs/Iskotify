// The number shown beside a focus exam on Today. A full-mock best is a "Best
// score"; without one, the fallback is the student's practice accuracy for that
// exam's listing — a different measure, so it must not borrow the mock label.

export interface FocusExamScore {
  pct: number | null
  label: 'Best score' | 'Practice accuracy' | 'No score yet'
}

export function focusExamScore(mockBest: number | null | undefined, listingAccuracy: number | null | undefined): FocusExamScore {
  if (mockBest != null) return { pct: mockBest, label: 'Best score' }
  if (listingAccuracy != null) return { pct: listingAccuracy, label: 'Practice accuracy' }
  return { pct: null, label: 'No score yet' }
}
