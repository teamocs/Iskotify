import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import type { HomeStats } from '../hooks/useHomeStats'
import { userSettings } from '../db/schema'
import { searchFlashcards, type RetrievedFlashcard } from './flashcardRetriever'

/**
 * One-line student identity for chat prompts. Used as the first line of
 * progress mode context.
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

  if (hasGrade && hasSchool) return `Student: ${name} (Grade ${grade}, ${school}).`
  if (hasGrade) return `Student: ${name} (Grade ${grade}).`
  if (hasSchool) return `Student: ${name} (${school}).`
  return `Student: ${name}.`
}

/**
 * Compact 3-line progress context for the chat prompt.
 *
 *   Student: Juan (Grade 11, UP Los Baños).
 *   Exam: UPCAT 2026 in 30 days. Today: 75% accuracy, 5-day streak.
 *   Weak topics: Algebra (32%), Biology (45%).
 *
 * Drops the per-session breakdown that PR 5 included — the 1.5B model
 * was using it as filler material rather than analytical signal.
 */
export async function buildProgressContext(
  db: DrizzleClient,
  stats: HomeStats,
): Promise<string> {
  const identity = await loadStudentIdentity(db)

  if (!stats.listing) {
    return `${identity}\nNo focused exam yet. Pick one from Listings to get personalized advice.`
  }

  // Build the exam/stats line, omitting accuracy entirely when null
  // (otherwise the model echoes literal "n/a%" into its responses).
  const examIntro = `Exam: ${stats.listing.title} in ${stats.daysLeft ?? '?'} days.`
  const statsLine = stats.todayAccuracy != null
    ? `Today: ${stats.todayAccuracy}% accuracy, ${stats.streakDays}-day streak.`
    : `${stats.streakDays}-day streak.`
  const examLine = `${examIntro} ${statsLine}`

  const lines: string[] = [identity, examLine]
  if (stats.weakTopics.length > 0) {
    const weakLine = stats.weakTopics
      .slice(0, 3)
      .map(t => `${t.topicName} (${t.accuracy}%)`)
      .join(', ')
    lines.push(`Weak topics: ${weakLine}.`)
  }

  return lines.join('\n')
}

// Keep individual fields short so 3 cards fit well under our token budget
// (target: <200 tokens for the whole block).
const MAX_FIELD_LEN = 140

function truncate(s: string, max = MAX_FIELD_LEN): string {
  const trimmed = s.trim().replace(/\s+/g, ' ')
  if (trimmed.length <= max) return trimmed
  return trimmed.slice(0, max - 1).trimEnd() + '…'
}

export function formatRetrievedFlashcards(cards: RetrievedFlashcard[]): string | null {
  if (cards.length === 0) return null
  const blocks = cards.map(c => {
    const lines = [`Q: ${truncate(c.question)}`, `A: ${truncate(c.answer)}`]
    const explanation = truncate(c.explanation)
    if (explanation) lines.push(`Why: ${explanation}`)
    return lines.join('\n')
  })
  return blocks.join('\n---\n')
}

/**
 * Retrieve top-K flashcards relevant to the user's question and format them
 * for prompt injection. Returns null when nothing matches (so callers can
 * conditionally skip the [RELEVANT FLASHCARDS] block in the prompt).
 */
export async function buildRetrievedFlashcards(
  db: DrizzleClient,
  question: string,
  limit = 3,
): Promise<string | null> {
  const cards = await searchFlashcards(db, question, limit)
  return formatRetrievedFlashcards(cards)
}
