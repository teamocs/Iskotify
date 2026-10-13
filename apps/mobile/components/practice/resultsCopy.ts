// Results-screen copy shared by every runner (iOS redesign P4). Calm, factual,
// English; never a verdict.

/** The results screen's one primary action: "Review 3 answers" (the ones to look at again). */
export function reviewAnswersLabel(toReview: number): string {
  if (toReview <= 0) return 'Review answers'
  return `Review ${toReview} answer${toReview === 1 ? '' : 's'}`
}

/** Wrong and skipped counts over the questions that count. */
export function resultCounts(
  questions: readonly { correctIndex: number }[],
  answers: Record<number, number>,
  counts: (i: number) => boolean = () => true,
): { correct: number; wrong: number; skipped: number; total: number } {
  let correct = 0, wrong = 0, skipped = 0
  questions.forEach((q, i) => {
    if (!counts(i)) return
    const a = answers[i]
    if (a === undefined) skipped++
    else if (a === q.correctIndex) correct++
    else wrong++
  })
  return { correct, wrong, skipped, total: correct + wrong + skipped }
}
