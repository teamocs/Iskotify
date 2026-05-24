import { desc, eq } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import type { HomeStats } from '../hooks/useHomeStats'
import { practiceSessions, topics, userSettings } from '../db/schema'

/**
 * One-line student identity for chat prompts. Used as the first line of
 * progress mode context and as the sole content of topic mode context.
 */
export async function loadStudentIdentity(db: DrizzleClient): Promise<string> {
  const rows = await db
    .select({
      fullName: userSettings.fullName,
      school: userSettings.school,
      gradeLevel: userSettings.gradeLevel,
    })
    .from(userSettings)
    .where(eq(userSettings.id, 1))
    .limit(1)

  const row = rows[0]
  const name = row?.fullName?.trim() ?? ''
  const school = row?.school?.trim() ?? ''
  const grade = row?.gradeLevel ?? null

  if (!name) return 'Student: (anonymous).'

  const hasSchool = school.length > 0
  const hasGrade = grade !== null

  if (hasGrade && hasSchool) return `Student: ${name} (Grade ${grade} student at ${school}).`
  if (hasGrade) return `Student: ${name} (Grade ${grade} student).`
  if (hasSchool) return `Student: ${name} (student at ${school}).`
  return `Student: ${name}.`
}

/**
 * Topic-mode context: just the identity line. Topic mode doesn't need stats.
 */
export async function buildTopicContext(db: DrizzleClient): Promise<string> {
  return loadStudentIdentity(db)
}

/**
 * Builds a prompt-ready progress context string from the user's HomeStats
 * plus their 5 most recent practice sessions (with topic names joined).
 * Used in "My progress" chat mode.
 */
export async function buildProgressContext(
  db: DrizzleClient,
  stats: HomeStats,
): Promise<string> {
  if (!stats.listing) {
    const identity = await loadStudentIdentity(db)
    return `${identity}\nNo focused exam yet. Pick one from Listings to get personalized advice.`
  }

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

  const identity = await loadStudentIdentity(db)

  return [
    identity,
    `Focused exam: ${stats.listing.title} in ${stats.daysLeft ?? '?'} days`,
    `Streak: ${stats.streakDays} days`,
    `Today's accuracy: ${stats.todayAccuracy ?? 'n/a'}%`,
    `Top weak topics: ${weakLine}`,
    'Recent sessions (last 5):',
    sessionLines,
  ].join('\n')
}
