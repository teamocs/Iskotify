// One definition of "weak" shared by the Home weak-topics list, the study plan,
// the Practice strength badge and the listing weak-quiz. They used to disagree
// (<50 / <60 / <0.6, some with no minimum sample), so the same topic could be
// "Weak" on one screen and fine on another.

import { resolveTopicLabel } from './topicLabel'

/** Accuracy below this (0–1) is weak. */
export const WEAK_THRESHOLD = 0.6
/** Accuracy at or above this is strong; between WEAK and this is "review". */
export const STRONG_THRESHOLD = 0.8
/** Fewer answers than this is too little evidence to call a topic weak or strong. */
export const MIN_SAMPLE = 5

export type Classification = 'new' | 'weak' | 'review' | 'strong'

export function classify(correct: number, total: number): Classification {
  if (total < MIN_SAMPLE) return 'new'
  const ratio = correct / total
  if (ratio < WEAK_THRESHOLD) return 'weak'
  if (ratio < STRONG_THRESHOLD) return 'review'
  return 'strong'
}

export interface WeakTopicEntry {
  topicId: string
  topicName: string
  accuracy: number
}

/**
 * Weak topics from per-topic {total, ok} stats (homeAggregates.getWeakTopicStats):
 * only topics with enough answers that classify as weak, weakest first.
 */
export function pickWeakTopics(
  stats: { topicId: string; total: number; ok: number }[],
  topicNames: Map<string, string>,
  limit = 4,
): WeakTopicEntry[] {
  return stats
    .filter(s => classify(s.ok, s.total) === 'weak')
    .map(s => ({
      topicId: s.topicId,
      topicName: resolveTopicLabel(s.topicId, topicNames),
      accuracy: Math.round((s.ok / s.total) * 100),
    }))
    .sort((a, b) => a.accuracy - b.accuracy || a.topicId.localeCompare(b.topicId))
    .slice(0, limit)
}
