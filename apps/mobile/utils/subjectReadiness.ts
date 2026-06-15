// Pure readiness helpers shared by Subject Details and the Home "Subjects to
// improve" grid so both surfaces report the SAME session-based readiness.
//
// Readiness reflects ALL practice sessions:
//   - topic-review sessions (getTopicBestSessionPercentages, keyed by topicId)
//   - subject-level MOCK sessions (getSubjectSessionPercentages, keyed by the
//     subject NAME — a blueprint section / UPCAT subtest whose name equals the
//     subject name).
// A mock covering a subject lifts every topic in it; an individual topic review
// can exceed the mock. No React, no DB — fully unit-testable.

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n))
}

/**
 * topicReadiness — readiness for ONE topic = the max of:
 *   - topicBest: that topic's own best topic-review session %, and
 *   - subjectBest: the subject-level mock best % (lifts every topic in the subject).
 * Either may be null (absent). Returns null only when BOTH are absent.
 */
export function topicReadiness(
  { topicBest, subjectBest }: { topicBest: number | null; subjectBest: number | null },
): number | null {
  if (topicBest == null && subjectBest == null) return null
  return Math.max(topicBest ?? -Infinity, subjectBest ?? -Infinity)
}

/**
 * subjectReadinessPct — the subject's grid/summary % = the average of
 * topicReadiness across the subject's topics (skipping topics with no readiness).
 *
 * Fallbacks:
 *   - if NO topic has any readiness, fall back to the subject-level mock best
 *     (subjectBestByName[subjectName]) so a subject practiced only via a mock
 *     (with no per-topic rows yet) still shows its real %;
 *   - null when nothing is known at all.
 * Result is rounded and clamped to 0–100.
 */
export function subjectReadinessPct(
  topics: Array<{ id: string }>,
  perTopicBestById: Map<string, number>,
  subjectName: string,
  subjectBestByName: Map<string, number>,
): number | null {
  const subjectBest = subjectBestByName.get(subjectName) ?? null

  let sum = 0
  let n = 0
  for (const topic of topics) {
    const r = topicReadiness({
      topicBest: perTopicBestById.get(topic.id) ?? null,
      subjectBest,
    })
    if (r != null) {
      sum += r
      n += 1
    }
  }

  if (n > 0) return clampPct(Math.round(sum / n))
  // No topic readiness — fall back to the subject-level mock best, if any.
  if (subjectBest != null) return clampPct(Math.round(subjectBest))
  return null
}
