import { eq, inArray } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import type { HomeStats } from '../hooks/useHomeStats'
import { userSettings, listings, careerCourses, focusListings } from '../db/schema'
import { searchFlashcards, searchUpcatFacts, searchCareerFacts, searchAiImpactByQuestion, type RetrievedFlashcard, type RetrievedUpcatFact, type RetrievedCareerFact, type RetrievedAiImpact } from './flashcardRetriever'

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

export function formatUpcatFacts(facts: RetrievedUpcatFact[]): string | null {
  if (facts.length === 0) return null
  const lines = facts.map(f => {
    const suffix = f.validYear != null
      ? ` (as of ${f.validYear}; verify at upcat.up.edu.ph)`
      : ' (verify at upcat.up.edu.ph)'
    return `- ${f.question} → ${f.answer}${suffix}`
  })
  return `[UPCAT FACTS]\n${lines.join('\n')}`
}

export function formatCareerFacts(facts: RetrievedCareerFact[]): string | null {
  if (facts.length === 0) return null
  const lines = facts.map(f => {
    const name = f.courseName ?? 'Career'
    const answer = f.quickAnswer ?? ''
    const caveat = f.keyCaveat ? `${f.keyCaveat}; ` : ''
    return `- ${name}: ${answer} (${caveat}verify with DMW/POEA & official sources)`
  })
  return `[CAREER FACTS]\n${lines.join('\n')}`
}

export function formatAiImpact(impact: RetrievedAiImpact | null): string | null {
  if (!impact) return null
  const name = impact.courseName ?? 'Unknown'
  const score = impact.aiSafetyScore ?? '?'
  const label = impact.aiSafetyLabel ?? ''
  const summary = impact.kuyaBawSummary ?? ''
  return `[AI CAREER IMPACT]\n- ${name} — AI-Safe-Score ${score}/5 (${label}): ${summary}`
}

/**
 * Retrieve top-K flashcards relevant to the user's question and format them
 * for prompt injection. Returns a string that already contains the proper
 * top-level labeled sections (siblings, separated by blank lines):
 *   - [RELEVANT FLASHCARDS]\n... when flashcards match
 *   - [UPCAT FACTS]\n...         when facts match
 *   - [CAREER FACTS]\n...        when career facts match
 *   - [AI CAREER IMPACT]\n...    when ai_career_impact row matches the question
 * Returns null when nothing matches.
 */
export async function buildRetrievedFlashcards(
  db: DrizzleClient,
  question: string,
  limit = 3,
): Promise<string | null> {
  const [cards, facts, careerFacts, aiImpact] = await Promise.all([
    searchFlashcards(db, question, limit),
    searchUpcatFacts(db, question, limit),
    searchCareerFacts(db, question, limit),
    // Reverse LIKE: find a row where the question contains the course name.
    // Handles "is computer science AI-proof?" → matches course_name='Computer Science'.
    searchAiImpactByQuestion(db, question),
  ])

  const flashcardsBody = formatRetrievedFlashcards(cards)
  const factsBlock = formatUpcatFacts(facts)
  const careerBlock = formatCareerFacts(careerFacts)
  const aiBlock = formatAiImpact(aiImpact)

  if (!flashcardsBody && !factsBlock && !careerBlock && !aiBlock) return null
  const parts: string[] = []
  if (flashcardsBody) parts.push(`[RELEVANT FLASHCARDS]\n${flashcardsBody}`)
  if (factsBlock) parts.push(factsBlock)
  if (careerBlock) parts.push(careerBlock)
  if (aiBlock) parts.push(aiBlock)
  return parts.join('\n\n')
}

// ── Listing + course context builders (Task 3) ────────────────────────────────

/**
 * Extract lowercase tokens (alpha-only, ≥3 chars) from a string for matching.
 */
function tokenize(s: string): string[] {
  return s.toLowerCase().match(/[a-z]{3,}/g) ?? []
}

/**
 * Return true if at least one token from `source` appears in the `questionTokens` set.
 */
function hasTokenOverlap(source: string, questionTokens: Set<string>): boolean {
  for (const tok of tokenize(source)) {
    if (questionTokens.has(tok)) return true
  }
  return false
}

/**
 * Format a Unix-epoch integer as a readable date string (YYYY-MM-DD).
 * Returns '' when the value is null/undefined/0.
 */
function fmtDate(epochMs: number | null | undefined): string {
  if (!epochMs) return ''
  return new Date(epochMs).toISOString().slice(0, 10)
}

/**
 * Build a compact [LISTINGS] context block for listings whose title, slug, or
 * acronym tokens overlap with the user's question. Returns undefined when nothing
 * matches (so the prompt is unchanged for unrelated questions).
 *
 * Format:
 *   [LISTINGS]
 *   - <title> (<type>): exam <date> / deadline <date>; <grant or provider>
 *
 * At most 2 listings, each line token-truncated to stay under 160 chars.
 */
export async function buildListingsContext(
  db: DrizzleClient,
  question: string,
): Promise<string | undefined> {
  try {
    const rows = await db
      .select({
        slug: listings.slug,
        title: listings.title,
        type: listings.type,
        examDate: listings.examDate,
        deadline: listings.deadline,
        grantAmount: listings.grantAmount,
        provider: listings.provider,
      })
      .from(listings)

    const questionTokens = new Set(tokenize(question))

    const matched = rows.filter(row => {
      // Match on title words, slug tokens, or an acronym (first letter of each title word)
      const acronym = row.title
        .split(/\s+/)
        .map(w => w[0] ?? '')
        .join('')
        .toLowerCase()
      return (
        hasTokenOverlap(row.title, questionTokens) ||
        hasTokenOverlap(row.slug, questionTokens) ||
        (acronym.length >= 2 && questionTokens.has(acronym))
      )
    })

    if (matched.length === 0) return undefined

    const lines = matched.slice(0, 2).map(row => {
      const parts: string[] = [`${truncate(row.title, 60)} (${row.type})`]
      const examDateStr = fmtDate(row.examDate)
      const deadlineStr = fmtDate(row.deadline)
      if (examDateStr) parts.push(`exam ${examDateStr}`)
      if (deadlineStr) parts.push(`deadline ${deadlineStr}`)
      const extra = row.grantAmount || row.provider
      if (extra) parts.push(truncate(extra, 40))
      return `- ${parts.join('; ')}`
    })

    return `[LISTINGS]\n${lines.join('\n')}`
  } catch {
    return undefined
  }
}

/**
 * Build a compact [COURSES] context block for career courses whose name tokens
 * overlap with the user's question. Also resolves which of the student's focused
 * listings accept the matched course (via targetCourses JSON ∩ {cluster, 'all'}).
 *
 * Returns undefined when nothing matches.
 *
 * Format:
 *   [COURSES]
 *   - <name> (cluster: <cluster>; board: <boardExamName>; demand: <demand>)
 *     Accepted by your focused: <listing titles>
 */
export async function buildCourseConnectionContext(
  db: DrizzleClient,
  question: string,
): Promise<string | undefined> {
  try {
    const [courseRows, focusRows] = await Promise.all([
      db.select({
        courseId: careerCourses.courseId,
        name: careerCourses.name,
        cluster: careerCourses.cluster,
        boardExam: careerCourses.boardExam,
        boardExamName: careerCourses.boardExamName,
        demand: careerCourses.demand,
      }).from(careerCourses),
      db.select({ listingSlug: focusListings.listingSlug }).from(focusListings),
    ])

    const questionTokens = new Set(tokenize(question))

    const matched = courseRows.filter(row =>
      row.name !== null && hasTokenOverlap(row.name, questionTokens)
    )

    if (matched.length === 0) return undefined

    // Load focused listing titles + targetCourses in one shot
    const focusSlugs = focusRows.map(r => r.listingSlug)
    const focusedListings = focusSlugs.length > 0
      ? await db.select({
          slug: listings.slug,
          title: listings.title,
          targetCourses: listings.targetCourses,
        }).from(listings).where(inArray(listings.slug, focusSlugs))
      : []

    const lines = matched.slice(0, 2).map(row => {
      const namePart = truncate(row.name ?? 'Unknown', 40)
      const clusterPart = row.cluster ? `cluster: ${truncate(row.cluster, 30)}` : null
      const boardPart = row.boardExam && row.boardExamName
        ? `board: ${truncate(row.boardExamName, 30)}`
        : row.boardExam ? 'has board exam' : null
      const demandPart = row.demand ? `demand: ${row.demand}` : null
      const meta = [clusterPart, boardPart, demandPart].filter(Boolean).join('; ')

      // Find focused listings that accept this course's cluster (or 'all')
      const cluster = row.cluster ?? ''
      const acceptedTitles = focusedListings
        .filter(fl => {
          try {
            const tc: string[] = JSON.parse(fl.targetCourses ?? '[]')
            return tc.includes('all') || (cluster && tc.includes(cluster))
          } catch {
            return false
          }
        })
        .map(fl => fl.title)
        .join(', ')

      const mainLine = `- ${namePart}${meta ? ` (${meta})` : ''}`
      const acceptedLine = acceptedTitles
        ? `  Accepted by your focused: ${truncate(acceptedTitles, 80)}`
        : null
      return [mainLine, acceptedLine].filter(Boolean).join('\n')
    })

    return `[COURSES]\n${lines.join('\n')}`
  } catch {
    return undefined
  }
}
