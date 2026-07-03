/**
 * routingGolden.test.ts — Phase 3 (T3.3) golden-question routing eval.
 *
 * A data-driven table asserting the two routing decisions that gate Kuya Baw's
 * retrieval/answer path: `classifyDataIntent` (which deterministic data lookup,
 * or null → LLM) and `isMathQuestion` (math mode). Kept aligned with the
 * precision-biased contract so any future routing/prompt change is MEASURED by
 * this suite rather than silently regressing.
 *
 * The table is representative, not exhaustive — the exhaustive per-signal cases
 * live in ssotAnswer.test.ts / chatPrompts.test.ts. This file is the canary.
 */

import { classifyDataIntent, type DataIntent } from '../ssotAnswer'
import { isMathQuestion } from '../chatPrompts'

interface GoldenCase {
  q: string
  math: boolean
  intent: DataIntent | null
  note?: string
}

const GOLDEN: GoldenCase[] = [
  // Listings — exams & scholarships (a bare year must NOT flip these to math).
  { q: 'when is UPCAT 2026?', math: false, intent: 'listings' },
  { q: 'what scholarships can I get?', math: false, intent: 'listings' },

  // Subjects / review enumeration.
  { q: 'what subjects are there?', math: false, intent: 'subjects' },

  // Profile — first-person progress + app config.
  { q: 'how am I doing this week?', math: false, intent: 'profile' },
  { q: 'what are my settings?', math: false, intent: 'profile' },

  // Schools — rankings / where to study (schools wins over the course noun).
  { q: 'best school for nursing', math: false, intent: 'schools' },

  // Destinations — working abroad.
  { q: 'can I work abroad as a nurse?', math: false, intent: 'destinations' },

  // Courses — demand / AI-impact.
  { q: 'is computer science in demand?', math: false, intent: 'courses' },

  // Math — real math routes to math mode and NEVER to a data intent.
  { q: 'solve 2x + 6 = 14', math: true, intent: null },

  // Reasoning — definition question, neither math nor a data lookup.
  { q: 'what is photosynthesis?', math: false, intent: null },

  // Anaphoric follow-up. DEVIATION from the plan's suggested `null`:
  // classifyDataIntent operates on the RAW string and "abroad" is itself a
  // strong standalone DESTINATION signal, so the classifier returns
  // 'destinations'. Anaphora resolution (prepending the prior user question)
  // happens UPSTREAM in buildRetrievalQuery, not in the classifier — so
  // 'destinations' is the correct real behavior here. Asserting reality.
  {
    q: 'what about abroad?',
    math: false,
    intent: 'destinations',
    note: 'anaphoric — but "abroad" is a standalone destination signal, so the classifier routes it',
  },
]

describe('routing golden eval', () => {
  it.each(GOLDEN)('isMathQuestion("$q") === $math', ({ q, math }) => {
    expect(isMathQuestion(q)).toBe(math)
  })

  it.each(GOLDEN)('classifyDataIntent("$q") === $intent', ({ q, intent }) => {
    expect(classifyDataIntent(q)).toBe(intent)
  })
})
