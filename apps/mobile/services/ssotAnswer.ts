/**
 * ssotAnswer.ts — Source-of-Truth (SSoT) deterministic answer router.
 *
 * Goal: data-lookup questions (about the student's own profile/progress, top
 * schools, career destinations abroad, courses, and listings/scholarships/exams)
 * are answered DETERMINISTICALLY from the already-synced local DB — WITHOUT
 * calling the LLM ("do not consume AI" path). Only reasoning questions
 * (definitions, science, math, general problem-solving) fall through to the LLM.
 *
 * This module is pure + DB-only: no React, no LLM, no network. It REUSES the
 * existing chatContext builders for retrieval/formatting and converts their
 * bracket-block output into a friendly, user-facing message.
 *
 * Determinism contract: every answer is grounded ONLY in DB data. No fabrication.
 */

import type { DrizzleClient } from '../db/client'
import type { HomeStats } from '../hooks/useHomeStats'
import { isMathQuestion } from './chatPrompts'
import {
  buildProgressContext,
  buildTopSchoolsContext,
  buildCareerDestinationsContext,
  buildCourseConnectionContext,
  buildListingsContext,
  buildListingsEnumeration,
  buildSubjectsContext,
} from './chatContext'

export type DataIntent = 'profile' | 'subjects' | 'schools' | 'destinations' | 'courses' | 'listings'

// ── Intent signal sets ────────────────────────────────────────────────────────
// All matching is case-insensitive (regex `i` flag / lowercased input).
// Order of evaluation in classifyDataIntent is most-specific-first:
//   profile → subjects → schools → destinations → courses → listings
// so a "best school for nursing" question routes to `schools`, not `courses`.

/**
 * profile — first-person questions about the student's OWN study/progress.
 * Mirrors the spirit of PROGRESS_SIGNALS in chatPrompts.ts (kept local so we
 * never accidentally couple SSoT routing to prompt-mode detection, which has a
 * different "topic is the safe default" bias).
 */
const PROFILE_SIGNALS: RegExp[] = [
  // English first-person SUBJECT "am i / i am" (excludes "tell me about X" where
  // "me" is the object). Bare "do i / can i / will i" are intentionally NOT here —
  // they attach to many non-progress verbs ("what visa do I need", "can I migrate")
  // and would steal schools/destinations questions since profile is checked first.
  /\b(am i|i am)\b/i,
  // "should I <study-verb>" — but NOT "where should I study" (a schools phrasing
  // listed in SCHOOL_SIGNALS). Lookbehind keeps that out of profile.
  /(?<!where\s)\bshould i\s+(focus|study|review|practice|work on|prioriti[sz]e)\b/i,
  // Readiness / pacing phrases about the student
  /\b(on track|behind|catching up|am i ready|am i prepared|how am i doing)\b/i,
  // English possessive "my" paired with study/progress/config nouns. Also covers
  // app-config nouns (settings/preferences/account/targets/plan) so "what are my
  // settings / focused exams" surface the student's configured focus.
  /\bmy\s+(progress|streak|exam|score|scores|accuracy|weak|strong|focus(ed)?|study|deck|cards?|listing|topics?|grade|grades|subject|subjects|review|stats|readiness|performance|settings?|config(uration)?|preferences?|account|targets?|plan)\b/i,
  // "what should i focus / study" (focus/readiness intent without "my")
  /\bwhat\s+(should|do)\s+i\s+(focus|study|review|work on|practice)\b/i,
  // "what am i / what are my …" — first-person status/config questions
  /\bwhat\s+(am i|are my)\b/i,
  // Tagalog first-person markers — "ako" (I), "kong/ko" (my), "akin" (mine)
  /\b(ako|kong|akin)\b/i,
  // Tagalog "dapat ko" / "dapat kong" (I should) and "kaya ko" (I can)
  /\bdapat (kong?|ko)\b/i,
  /\bkaya ko\b/i,
]

/** schools — board pass rates / school rankings / "where to study". Nouns are
 *  pluralized so "best schools for nursing" routes here (not the LLM). */
const SCHOOL_SIGNALS: RegExp[] = [
  /\btop\s+(schools?|universit(?:y|ies)|colleges?)\b/i,
  /\bbest\s+(schools?|universit(?:y|ies)|colleges?|uni)\b/i,
  /\bpass\s*rate(s)?\b/i,
  /\bboard\s*(exam\s*)?pass(ers|ing)?\b/i,
  /\bwhich\s+(school|universit(?:y|ies)|college)s?\b/i,
  /\bschool\s+rank(ing|ings)?\b/i,
  /\bwhere\s+(should\s+i|can\s+i|to)\s+study\b/i,
]

/** destinations — working/migrating abroad, salary/visa/PR overseas. "country"
 *  and "pr" are gated behind real work/abroad context to avoid stealing generic
 *  reasoning questions ("what is PR", "capital of which country"). */
const DESTINATION_SIGNALS: RegExp[] = [
  /\babroad\b/i,
  /\boverseas\b/i,
  /\bwork\s+(in|abroad|overseas)\b/i,
  /\bdestination(s)?\b/i,
  /\bsalary\s+(abroad|overseas)\b/i,
  /\bvisa\b/i,
  /\b(permanent\s+residency|pr\s+(pathway|visa|status|route))\b/i,
  /\bmigrat(e|ion)\b/i,
  /\bofw\b/i,
  // "country/countries" only when paired with a work/abroad/pay co-signal
  /\b(work|jobs?|hir(e|ing)|demand|salar(y|ies)|pays?|paid|earn|relocat|move|migrate)\b[\s\S]*\bcountr(y|ies)\b/i,
  /\bcountr(y|ies)\b[\s\S]*\b(work|jobs?|hir(e|ing)|demand|salar(y|ies)|pays?|paid|earn|abroad|migrate)\b/i,
]

/** listings — scholarships, grants, exams, deadlines, applications, acronyms.
 *  Bare "exam"/"when is"/"application"/"requirements" are intentionally NOT here
 *  (they steal reasoning questions like "this exam is hard", "when is the eclipse",
 *  "application of derivatives"); each is matched only with listing context. */
const LISTING_SIGNALS: RegExp[] = [
  /\bscholarship(s)?\b/i,
  /\bgrant(s)?\b/i,
  /\b(entrance|qualifying|admission|college\s+entrance)\s+exam(s)?\b/i,
  /\bmock\s+exam(s)?\b/i,
  /\bexam\s+(schedule|date|dates|deadline|requirements?|registration)\b/i,
  /\bwhat\s+(exams?|scholarships?)\s+(can|should|are|do|to)\b/i,
  /\bdeadline(s)?\b/i,
  /\bapplication\s+(deadline|window|form|period|requirements?|portal)\b/i,
  /\b(scholarship|exam|admission)\s+requirements?\b/i,
  // Common PH entrance-exam / scholarship acronyms
  /\b(upcat|acet|dcat|ustet|pupcet|usthet|\bcet\b|dost|ched)\b/i,
]

/**
 * subjects — general "what subjects / topics are there / offered" and "list my
 * review topics" enumeration questions. Precision-biased: only fires on a
 * plural subjects/topics noun inside a list/study framing. A guard rejects
 * grammar uses of the word ("subject of the sentence", "the topic sentence").
 */
const SUBJECT_SIGNALS: RegExp[] = [
  /\b(what|which|list|show|all|the)\b[\s\S]*\b(subjects?|topics?)\b/i,
  /\b(subjects?|topics?)\s+(offered|available|to review|to study|are there)\b/i,
  /\bmy\s+(subjects?|topics?)\b/i,
]

function isSubjectIntent(q: string): boolean {
  // Grammar guard — "subject of the sentence" / "the topic sentence" are not
  // data-lookup questions about the student's review subjects.
  if (/\bsentence\b/i.test(q)) return false
  return anyMatch(q, SUBJECT_SIGNALS)
}

/**
 * courses — programs/degrees, demand, board exam, AI-impact. Course/program/
 * degree nouns require a study/career/decision co-signal so generic uses ("of
 * course", "program counter", "computer program") fall through to the LLM.
 */
function isCourseIntent(q: string): boolean {
  if (/\bof\s+course\b/i.test(q) || /\bcourse\s+of\s+action\b/i.test(q)) return false
  // Strong standalone course / AI-impact / demand signals.
  if (/\bai-?proof\b/i.test(q)) return true
  if (/\bai\s+impact(s)?\b/i.test(q)) return true
  if (/\bwill\s+ai\s+(replace|take\s+over)\b/i.test(q)) return true
  if (/\bin\s*demand\b/i.test(q)) return true
  if (/\bcareer\s+path(s)?\b/i.test(q)) return true
  // "automation" only when tied to careers/jobs (not "cellular automation").
  if (/\bautomation\b/i.test(q) && /\b(affects?|replace(s|d)?|impact|risk|jobs?|career|profession|industry|work|workforce)\b/i.test(q)) return true
  // course/program/degree/major noun + a decision / study / career co-signal.
  const hasCourseNoun = /\b(course|program|degree|major)s?\b/i.test(q)
  const hasCourseContext =
    /\b(take|study|pursue|choose|enrol|enroll|good|best|right|recommend(ed)?|worth|college|university|board\s+exam|career|future|demand|tell\s+me\s+about|learn\s+about|info(rmation)?\s+(on|about))\b/i.test(q)
  return hasCourseNoun && hasCourseContext
}

function anyMatch(question: string, signals: RegExp[]): boolean {
  for (const re of signals) {
    if (re.test(question)) return true
  }
  return false
}

/**
 * classifyDataIntent — pure, RULE-BASED (no AI) intent classifier.
 *
 * Returns the data intent for a data-lookup question, or `null` for a pure
 * reasoning question (definition / science / math / general problem-solving /
 * greeting) that should fall through to the LLM.
 *
 * Evaluation order is most-specific-first: profile → schools → destinations →
 * courses → listings. This matters because keyword sets overlap (e.g. "best
 * school for nursing" contains both a school signal and the course noun
 * "nursing" via context — schools wins because it's checked first).
 *
 * Reasoning guard: math questions (isMathQuestion) and pure definition/
 * explanation questions ("what is X", "define X", "explain X") return null
 * UNLESS they also carry a stronger data signal. The definition guard is only
 * applied when NO data signal matched, so "what is the UPCAT deadline" still
 * routes to listings.
 */
export function classifyDataIntent(question: string): DataIntent | null {
  if (!question) return null
  const q = question.trim()
  if (!q) return null

  // Math is always reasoning → LLM. Checked first so "solve 2x+5=11" never
  // false-matches a data keyword.
  if (isMathQuestion(q)) return null

  // Most-specific-first cascade.
  if (anyMatch(q, PROFILE_SIGNALS)) return 'profile'
  if (isSubjectIntent(q)) return 'subjects'
  if (anyMatch(q, SCHOOL_SIGNALS)) return 'schools'
  if (anyMatch(q, DESTINATION_SIGNALS)) return 'destinations'
  if (isCourseIntent(q)) return 'courses'
  if (anyMatch(q, LISTING_SIGNALS)) return 'listings'

  // No data signal → reasoning question → LLM.
  return null
}

// ── answerFromData ────────────────────────────────────────────────────────────

/**
 * Strip the leading "[TAG]\n" (or "[TAG]\r\n") bracket header that the
 * chatContext builders prepend, leaving just the human-readable body.
 */
function stripTag(block: string): string {
  return block.replace(/^\[[^\]]+\]\r?\n/, '').trim()
}

/**
 * Turn the "Weak topics: Algebra (32%), Biology (45%)." line emitted by
 * buildProgressContext into a clean bullet list when it lists multiple topics:
 *
 *   Weak topics:
 *   - Algebra (32%)
 *   - Biology (45%)
 *
 * A single weak topic is left inline (no need for a one-item list). All other
 * lines (Student / Exam) are returned unchanged. Pure presentation — no DB.
 */
function bulletizeWeakTopics(body: string): string {
  return body.replace(
    /^Weak topics:\s*(.+?)\.?$/im,
    (_full, list: string) => {
      const items = list
        .split(',')
        .map(s => s.trim())
        .filter(Boolean)
      if (items.length <= 1) return `Weak topics: ${items.join(', ')}.`
      return `Weak topics:\n${items.map(i => `- ${i}`).join('\n')}`
    },
  )
}

/**
 * answerFromData — convert the matched intent into a friendly, user-facing
 * message sourced ONLY from the synced local DB via the chatContext builders.
 *
 * Returns `null` when the relevant builder finds no matching data (the caller
 * shows ssotNotFoundMessage). The `profile` intent always returns a sensible
 * message because buildProgressContext never returns empty.
 */
export async function answerFromData(
  db: DrizzleClient,
  question: string,
  intent: DataIntent,
  stats: HomeStats,
): Promise<string | null> {
  switch (intent) {
    case 'profile': {
      // buildProgressContext is already human-readable (Student / Exam / Weak
      // topics lines). Present the "Weak topics: a (x%), b (y%)" line as a
      // short bullet list so multiple weak topics read as a list, then return
      // with a short, warm lead.
      const ctx = await buildProgressContext(db, stats)
      const body = bulletizeWeakTopics(ctx.trim())
      if (!body) return null
      return `Here's your progress snapshot:\n${body}`
    }

    case 'subjects': {
      const block = await buildSubjectsContext(db)
      if (!block) return null
      const body = stripTag(block)
      if (!body) return null
      return `Here are your review subjects:\n${body}`
    }

    case 'schools': {
      const block = await buildTopSchoolsContext(db, question)
      if (!block) return null
      const body = stripTag(block)
      if (!body) return null
      return (
        `Top schools by PRC board pass rate:\n${body}\n` +
        `(figures change yearly — verify on the school's site)`
      )
    }

    case 'destinations': {
      const block = await buildCareerDestinationsContext(db, question)
      if (!block) return null
      const body = stripTag(block)
      if (!body) return null
      return (
        `Where this course can take you abroad:\n${body}\n` +
        `(verify with DMW/POEA & official sources)`
      )
    }

    case 'courses': {
      const block = await buildCourseConnectionContext(db, question)
      if (!block) return null
      const body = stripTag(block)
      if (!body) return null
      return `Here's what I have on that course:\n${body}`
    }

    case 'listings': {
      // Specific named match wins (e.g. "when is the UPCAT deadline").
      const specific = await buildListingsContext(db, question)
      if (specific) {
        const body = stripTag(specific)
        if (body) return `From your Lists:\n${body}`
      }
      // No specific record → fall back to enumeration ("what exams can I take").
      const enumeration = await buildListingsEnumeration(db, question)
      if (!enumeration) return null
      const enumBody = stripTag(enumeration)
      if (!enumBody) return null
      return `From your Lists:\n${enumBody}`
    }
  }
}

/**
 * ssotNotFoundMessage — one friendly sentence shown when the SSoT path matched
 * an intent but the synced DB had no data for it. Phrasing nudges the student
 * toward the tab where that data will appear after a sync/browse.
 */
export function ssotNotFoundMessage(intent: DataIntent): string {
  switch (intent) {
    case 'profile':
      return "I don't have your progress yet — do a quick practice session and it'll show up here. 📚"
    case 'subjects':
      return "I don't have your review subjects synced yet — open the Exams/Review tab and they'll show up. 📚"
    case 'schools':
      return "I don't have school pass-rate data for that course yet — browse the Exams tab and it'll sync here. 📚"
    case 'destinations':
      return "I don't have abroad/destination data for that course yet — check the Exams tab and it'll show up here. 📚"
    case 'courses':
      return "I don't have that course in your synced data yet — browse the Lists tab (or Exams) and it'll show up here. 📚"
    case 'listings':
      return "I don't have that in your synced data yet — browse the Lists tab (or Exams) and it'll show up here. 📚"
  }
}
