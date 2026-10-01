// Pure readiness helpers shared by Subject Details, Progress and Practice so
// they all report the SAME number.
//
// Readiness = weighted recent accuracy: over the most recent READINESS_WINDOW
// ANSWERED questions in a subject (or topic), correct / answered. It is
// computed by services/homeAggregates (getSubjectRecentAccuracy /
// getTopicRecentAccuracy); this module only holds the shared constants and the
// lookups on top of those maps. Replaces the old all-time best session %, which
// stuck a student at one lucky result forever, and the max(topic, subject)
// lift, which hid a weak topic behind a strong subject.
//
// Below READINESS_MIN_ANSWERED answers there is not enough evidence for a
// number: readiness is null and the UI says "Not started".
// No React, no DB — fully unit-testable.

/** How many of the most recent answered questions readiness looks at. */
export const READINESS_WINDOW = 60
/** Fewer answered questions than this shows "Not started" instead of a number. */
export const READINESS_MIN_ANSWERED = 10

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, n))
}

/**
 * topicReadiness — a topic's readiness is its own recent accuracy, or null when
 * it has too few answers. Deliberately NOT lifted by the subject's result.
 */
export function topicReadiness(topicPct: number | null | undefined): number | null {
  return topicPct == null ? null : clampPct(Math.round(topicPct))
}

/**
 * subjectReadinessPct — the subject's recent accuracy by NAME (flashcard
 * subjects are projected from the UPCAT subtests, so the name matches the
 * canonical subtest on attempts), or null when there is too little evidence.
 */
export function subjectReadinessPct(
  subjectName: string,
  subjectPctByName: Map<string, number>,
): number | null {
  const pct = subjectPctByName.get(subjectName)
  return pct == null ? null : clampPct(Math.round(pct))
}
