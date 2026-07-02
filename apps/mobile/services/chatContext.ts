import { eq, inArray } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import type { HomeStats } from '../hooks/useHomeStats'
import { userSettings, listings, careerCourses, focusListings, courseSchoolRankings, careerDestinations, subjects, topics } from '../db/schema'
import { searchFlashcardsAuto, searchUpcatFactsAuto, searchCareerFactsAuto, searchAiImpactByQuestion, searchTopSchools, searchCareerDestinations, type RetrievedFlashcard, type RetrievedUpcatFact, type RetrievedCareerFact, type RetrievedAiImpact } from './flashcardRetriever'
import { cachedQuery } from './queryCache'

// TTL for stable table reads that feed context builders.
// 5 minutes — these tables only change on sync or user focus-edits, both of
// which call invalidate('chat:') to force a fresh read.
const CHAT_META_TTL = 300_000

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
  // Surface the student's configured focus (exams/scholarships) so "what are my
  // focused exams / settings" profile answers name them. Up to 5, comma-joined.
  if (stats.focusedListings.length > 0) {
    const focusedTitles = stats.focusedListings
      .slice(0, 5)
      .map(f => f.title)
      .join(', ')
    lines.push(`Focused: ${focusedTitles}`)
  }
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
    // Year-only note when present; NO hardcoded URL. A spurious "verify at
    // upcat.up.edu.ph" suffix used to be injected here — it primed the model to
    // invent more URLs. The URL_RULE in chatPrompts.ts handles verification copy
    // generically; the only DB-sourced URLs are listings.external_url.
    const suffix = f.validYear != null ? ` (as of ${f.validYear})` : ''
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
    // Auto variants: FTS on native, LIKE fallback on web (FTS tables not created by sql.js).
    searchFlashcardsAuto(db, question, limit),
    searchUpcatFactsAuto(db, question, limit),
    searchCareerFactsAuto(db, question, limit),
    // Reverse LIKE: find a row where the question contains the course name.
    // Handles "is computer science AI-proof?" → matches course_name='Computer Science'.
    // searchAiImpactByQuestion uses plain LIKE already — no platform gate needed.
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
    // Cache the full listings meta read — the OUTPUT filtering is question-dependent
    // but the raw table scan is stable until sync or a focus-edit fires invalidate('chat:').
    const rows = await cachedQuery('chat:listings-meta-v2', CHAT_META_TTL, () =>
      db
        .select({
          slug: listings.slug,
          title: listings.title,
          type: listings.type,
          examDate: listings.examDate,
          deadline: listings.deadline,
          grantAmount: listings.grantAmount,
          provider: listings.provider,
          externalUrl: listings.externalUrl,
        })
        .from(listings)
    )

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
      // Append official URL AFTER all truncated fields — URLs must not be truncated mid-way.
      const url = row.externalUrl?.trim()
      if (url) parts.push(`official site: ${url}`)
      return `- ${parts.join('; ')}`
    })

    return `[LISTINGS]\n${lines.join('\n')}`
  } catch {
    return undefined
  }
}

/**
 * Build a [LISTINGS] ENUMERATION block that answers general "what exams /
 * scholarships can I take" questions — i.e. when no specific named record was
 * matched by buildListingsContext. Rather than token-overlap, it lists the
 * catalog, optionally filtered to the intended type (exam vs scholarship).
 *
 * Type detection from the question:
 *   - exam-side keywords → only type='exam'
 *   - scholarship-side keywords → only type='scholarship'
 *   - both or neither → include both types
 *
 * Prefers status !== 'closed' (falls back to closed rows only if that would
 * otherwise leave nothing to show). Exams sort before scholarships, then by
 * title. Emits up to 8 rows; if more remain, a final "…and more" line points to
 * the Lists tab. Returns undefined ONLY when the listings table is empty.
 *
 * Format:
 *   [LISTINGS]
 *   - <title> (<type>)[; exam <date>][; deadline <date>]
 */
export async function buildListingsEnumeration(
  db: DrizzleClient,
  question: string,
): Promise<string | undefined> {
  try {
    const rows = await cachedQuery('chat:listings-enum', CHAT_META_TTL, () =>
      db
        .select({
          slug: listings.slug,
          title: listings.title,
          type: listings.type,
          status: listings.status,
          examDate: listings.examDate,
          deadline: listings.deadline,
        })
        .from(listings)
    )

    if (rows.length === 0) return undefined

    const examSide = /\b(exams?|entrance|tests?|admissions?|cet|upcat)\b/i.test(question)
    const scholarshipSide = /\b(scholarships?|grants?|financial|aid|stipends?|allowances?|iskolar)\b/i.test(question)

    let filtered = rows
    if (examSide && !scholarshipSide) filtered = rows.filter(r => r.type === 'exam')
    else if (scholarshipSide && !examSide) filtered = rows.filter(r => r.type === 'scholarship')

    // Prefer non-closed listings, but keep closed ones if excluding them would
    // leave nothing to show (the table is not empty → we must emit something).
    const open = filtered.filter(r => r.status !== 'closed')
    const chosen = open.length > 0 ? open : filtered

    // Exams before scholarships, then alphabetical by title.
    chosen.sort((a, b) => {
      if (a.type !== b.type) return a.type === 'exam' ? -1 : 1
      return a.title.localeCompare(b.title)
    })

    const shown = chosen.slice(0, 8)
    const lines = shown.map(row => {
      const parts: string[] = [`${row.title} (${row.type})`]
      const examDateStr = fmtDate(row.examDate)
      const deadlineStr = fmtDate(row.deadline)
      if (examDateStr) parts.push(`exam ${examDateStr}`)
      if (deadlineStr) parts.push(`deadline ${deadlineStr}`)
      return `- ${parts.join('; ')}`
    })

    if (chosen.length > 8) {
      lines.push('- …and more — open the Lists tab to browse all.')
    }

    return `[LISTINGS]\n${lines.join('\n')}`
  } catch {
    return undefined
  }
}

/**
 * Build a [SUBJECTS] context block listing the student's review subjects and how
 * many topics each has. Answers general "what subjects are there / list my
 * review topics" questions. Returns undefined when no subjects are synced.
 *
 * Format:
 *   [SUBJECTS]
 *   - <name> (<n> topics)
 */
export async function buildSubjectsContext(
  db: DrizzleClient,
): Promise<string | undefined> {
  try {
    const [subjectRows, topicRows] = await cachedQuery('chat:subjects', CHAT_META_TTL, async () => {
      const s = await db.select({ id: subjects.id, name: subjects.name }).from(subjects)
      const t = await db.select({ subjectId: topics.subjectId }).from(topics)
      return [s, t] as const
    })

    if (subjectRows.length === 0) return undefined

    const topicCounts = new Map<string, number>()
    for (const t of topicRows) {
      topicCounts.set(t.subjectId, (topicCounts.get(t.subjectId) ?? 0) + 1)
    }

    const lines = subjectRows
      .map(s => ({ name: s.name, count: topicCounts.get(s.id) ?? 0 }))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(s => `- ${s.name} (${s.count} topics)`)

    return `[SUBJECTS]\n${lines.join('\n')}`
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
    // Cache both stable reads together. careerCourses only changes on content sync;
    // focusListings changes on add/remove (useFocusListings fires invalidate('chat:')
    // on those mutations, so stale focus data is immediately evicted).
    const [courseRows, focusRows] = await Promise.all([
      cachedQuery('chat:course-meta', CHAT_META_TTL, () =>
        db.select({
          courseId: careerCourses.courseId,
          name: careerCourses.name,
          cluster: careerCourses.cluster,
          boardExam: careerCourses.boardExam,
          boardExamName: careerCourses.boardExamName,
          demand: careerCourses.demand,
        }).from(careerCourses)
      ),
      cachedQuery('chat:focus-meta', CHAT_META_TTL, () =>
        db.select({ listingSlug: focusListings.listingSlug }).from(focusListings)
      ),
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

// ── Top Schools (PRC pass rates) + Career Destinations builders (C2 / C3) ──────

/**
 * Build a compact [TOP SCHOOLS] context block for the course that the question
 * mentions, sourced from course_school_rankings (PRC board pass rates). Returns
 * undefined when no course matches.
 *
 * Format:
 *   [TOP SCHOOLS]
 *   - <course> board pass rates (PRC): 1. <school> (<region>) <pass%>; 2. …
 *
 * Web-safe: the stable table read is cached; question→course matching and the
 * top-N-by-rank selection happen in-memory (searchTopSchools). At most 5 schools.
 */
export async function buildTopSchoolsContext(
  db: DrizzleClient,
  question: string,
): Promise<string | undefined> {
  try {
    const rows = await cachedQuery('chat:school-rankings', CHAT_META_TTL, () =>
      db
        .select({
          courseTab: courseSchoolRankings.courseTab,
          courseName: courseSchoolRankings.courseName,
          rank: courseSchoolRankings.rank,
          schoolName: courseSchoolRankings.schoolName,
          region: courseSchoolRankings.region,
          rawPassRate: courseSchoolRankings.rawPassRate,
          totalExaminees: courseSchoolRankings.totalExaminees,
          totalPassers: courseSchoolRankings.totalPassers,
        })
        .from(courseSchoolRankings)
    )

    const matched = searchTopSchools(rows, question, 5)
    if (!matched) return undefined

    const items = matched.schools.map((s, i) => {
      const region = s.region ? ` (${truncate(s.region, 24)})` : ''
      const pass = s.rawPassRate != null ? ` ${s.rawPassRate}%` : ''
      const counts =
        s.totalPassers != null && s.totalExaminees != null
          ? ` [${s.totalPassers}/${s.totalExaminees}]`
          : ''
      return `${i + 1}. ${truncate(s.schoolName, 48)}${region}${pass}${counts}`
    })

    const course = truncate(matched.course, 40)
    return `[TOP SCHOOLS]\n- ${course} board pass rates (PRC): ${items.join('; ')}`
  } catch {
    return undefined
  }
}

/**
 * Build a compact [CAREER DESTINATIONS] context block for the course that the
 * question mentions, sourced from career_destinations. Returns undefined when
 * no course matches.
 *
 * Format:
 *   [CAREER DESTINATIONS]
 *   - <course> abroad: <Country> — <salary>; visa: <…>; PR: <…>; license: <…>[; ⚠ <saturationWarning>]
 *
 * Web-safe: careerCourses + careerDestinations reads are cached; matching and
 * top-N selection happen in-memory (searchCareerDestinations). At most 3 rows.
 */
export async function buildCareerDestinationsContext(
  db: DrizzleClient,
  question: string,
): Promise<string | undefined> {
  try {
    const [destRows, courseRows] = await Promise.all([
      cachedQuery('chat:career-destinations', CHAT_META_TTL, () =>
        db
          .select({
            courseId: careerDestinations.courseId,
            country: careerDestinations.country,
            salaryMin: careerDestinations.salaryMin,
            salaryMax: careerDestinations.salaryMax,
            salaryLocal: careerDestinations.salaryLocal,
            salaryType: careerDestinations.salaryType,
            visaPathway: careerDestinations.visaPathway,
            prPathway: careerDestinations.prPathway,
            licensingExam: careerDestinations.licensingExam,
            saturationWarning: careerDestinations.saturationWarning,
          })
          .from(careerDestinations)
      ),
      cachedQuery('chat:course-meta', CHAT_META_TTL, () =>
        db.select({
          courseId: careerCourses.courseId,
          name: careerCourses.name,
          cluster: careerCourses.cluster,
          boardExam: careerCourses.boardExam,
          boardExamName: careerCourses.boardExamName,
          demand: careerCourses.demand,
        }).from(careerCourses)
      ),
    ])

    const courseNamesById = new Map<string, string>()
    for (const c of courseRows) {
      if (c.courseId && c.name) courseNamesById.set(c.courseId, c.name)
    }

    const matched = searchCareerDestinations(destRows, courseNamesById, question, 3)
    if (!matched) return undefined

    const lines = matched.destinations.map(d => {
      const parts: string[] = []
      const country = d.country ? truncate(d.country, 32) : 'Abroad'
      // Salary: "<min>–<max> <local>/<type>" — omit pieces that are null.
      let salary = ''
      if (d.salaryMin != null && d.salaryMax != null) salary = `${d.salaryMin}–${d.salaryMax}`
      else if (d.salaryMin != null) salary = `${d.salaryMin}+`
      else if (d.salaryMax != null) salary = `up to ${d.salaryMax}`
      if (salary && d.salaryLocal) salary += ` ${d.salaryLocal}`
      if (salary && d.salaryType) salary += `/${d.salaryType}`
      parts.push(salary ? `${country} — ${salary}` : country)
      if (d.visaPathway) parts.push(`visa: ${truncate(d.visaPathway, 40)}`)
      if (d.prPathway) parts.push(`PR: ${truncate(d.prPathway, 40)}`)
      if (d.licensingExam) parts.push(`license: ${truncate(d.licensingExam, 30)}`)
      let line = `- ${parts.join('; ')}`
      if (d.saturationWarning) line += `; ⚠ ${truncate(d.saturationWarning, 40)}`
      return line
    })

    const course = truncate(matched.course, 40)
    // Course intro is a plain (non-bullet) line so each '-' line below is exactly
    // one destination — keeps the block easy to parse and budget.
    return `[CAREER DESTINATIONS]\n${course} abroad:\n${lines.join('\n')}`
  } catch {
    return undefined
  }
}
