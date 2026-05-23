import { desc } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import type { HomeStats } from '../hooks/useHomeStats'
import { practiceSessions, topics } from '../db/schema'

/**
 * Builds a prompt-ready progress context string from the user's HomeStats
 * plus their 5 most recent practice sessions (with topic names joined).
 * Used in "My progress" chat mode.
 */
export async function buildProgressContext(
  db: DrizzleClient,
  stats: HomeStats,
): Promise<string> {
  if (!stats.listing) return 'No focused exam yet. Pick one from Listings to get personalized advice.'

  const sessions = await db
    .select({
      completedAt: practiceSessions.completedAt,
      score: practiceSessions.score,
      total: practiceSessions.total,
      topicId: practiceSessions.topicId,
    })
    .from(practiceSessions)
    .orderBy(desc(practiceSessions.completedAt))
    .limit(5)

  // Build topic-id -> name lookup. Only query if we have sessions with topic IDs.
  const sessionTopicIds = sessions
    .map(s => s.topicId)
    .filter(t => t.length > 0)

  let topicMap = new Map<string, string>()
  if (sessionTopicIds.length > 0) {
    const allTopics = await db
      .select({ id: topics.id, name: topics.name })
      .from(topics)
    topicMap = new Map(allTopics.map(t => [t.id, t.name]))
  }

  const weakLine = stats.weakTopics.length > 0
    ? stats.weakTopics.slice(0, 3).map(t => `${t.topicName} (${t.accuracy}%)`).join(', ')
    : 'none yet'

  const sessionLines = sessions.length > 0
    ? sessions.map(s => {
        const dateStr = new Date(s.completedAt).toLocaleDateString('en-PH', {
          month: 'short',
          day: 'numeric',
        })
        const topicName = topicMap.get(s.topicId) ?? 'mixed practice'
        return `  - ${dateStr}: ${topicName} — ${s.score}/${s.total}`
      }).join('\n')
    : '  (no recent sessions)'

  return [
    `Focused exam: ${stats.listing.title} in ${stats.daysLeft ?? '?'} days`,
    `Streak: ${stats.streakDays} days`,
    `Today's accuracy: ${stats.todayAccuracy ?? 'n/a'}%`,
    `Top weak topics: ${weakLine}`,
    'Recent sessions (last 5):',
    sessionLines,
  ].join('\n')
}
