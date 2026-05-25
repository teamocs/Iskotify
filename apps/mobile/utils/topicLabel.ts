const PRE_ASSESS_PREFIX = 'pre-assess-'

/**
 * Resolve a topic identifier to a human-readable display label.
 *
 *   resolveTopicLabel('t1', topicMap)                  → 'Algebra'  (from topicMap)
 *   resolveTopicLabel('pre-assess-Mathematics', _map)  → 'Pre-Assessment: Mathematics'
 *   resolveTopicLabel('unknown-id', topicMap)          → 'unknown-id'  (literal fallback)
 *
 * The pre-assessment onboarding flow writes practice_sessions rows with a
 * synthetic topicId of the form `pre-assess-<Subject>`, since the 20 onboarding
 * questions are subject-bucketed and don't correspond to real flashcards/topics.
 * Map lookup wins when present — caller's catalog mappings take priority.
 */
export function resolveTopicLabel(
  topicId: string,
  topicMap: Map<string, string>,
): string {
  const mapped = topicMap.get(topicId)
  if (mapped) return mapped
  if (topicId.startsWith(PRE_ASSESS_PREFIX)) {
    return `Pre-Assessment: ${topicId.slice(PRE_ASSESS_PREFIX.length)}`
  }
  return topicId
}
