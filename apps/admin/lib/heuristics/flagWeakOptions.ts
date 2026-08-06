// Task F — distractor difficulty overhaul.
//
// Cheap, pure heuristics that flag a multiple-choice option set likely to
// give the correct answer away without reading the question. Curated
// upcat_questions seed content is never auto-rewritten (it's authored, not
// AI-generated) — instead this function powers the admin "Distractor Review
// Queue" (apps/admin/app/admin/upcat/review-queue/page.tsx), which lists
// flagged rows for a human to fix by hand.
//
// Deliberately pure and synchronous: no I/O, no randomness, no network — so
// it's trivial to unit test and cheap enough to run over every row in a
// server component render (see Global Constraints: "the heuristic review
// queue should be a read-only query", no migration involved).

export type WeakOptionFlag =
  | 'length_asymmetry'
  | 'duplicate_options'
  | 'none_or_all_of_above'
  | 'numeric_outlier'

export interface WeakOptionsResult {
  flags: WeakOptionFlag[]
  clean: boolean
}

const NONE_ALL_PATTERN =
  /\bnone\s+of\s+the\s+above\b|\ball\s+of\s+the\s+above\b|\bboth\s+[a-d]\s+and\s+[a-d]\b/i

// Two options are compared as "near-duplicate" after normalizing case and
// punctuation — a raw case/punctuation difference shouldn't hide a giveaway.
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

// Plain Levenshtein edit distance. Inputs here are single MC options (a few
// words at most), so the O(n*m) DP table is negligible.
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  let prev = new Array<number>(b.length + 1)
  let curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        curr[j - 1]! + 1, // insertion
        prev[j]! + 1, // deletion
        prev[j - 1]! + cost, // substitution
      )
    }
    ;[prev, curr] = [curr, prev]
  }
  return prev[b.length]!
}

// >=80% character similarity (edit distance <= 20% of the longer string)
// counts as a near-duplicate — close enough that a student can eliminate one
// option on sight without needing to actually solve the question.
const NEAR_DUPLICATE_MAX_RATIO = 0.2

function isNearDuplicate(a: string, b: string): boolean {
  if (!a || !b) return false
  if (a === b) return true
  const maxLen = Math.max(a.length, b.length)
  if (maxLen === 0) return true
  return levenshtein(a, b) / maxLen <= NEAR_DUPLICATE_MAX_RATIO
}

const CURRENCY_OR_PUNCT = /[,₱$%\s]/g
const PLAIN_NUMBER = /^-?\d+(\.\d+)?$/

function parseNumeric(s: string): number | null {
  const cleaned = s.replace(CURRENCY_OR_PUNCT, '')
  if (!PLAIN_NUMBER.test(cleaned)) return null
  const n = Number(cleaned)
  return Number.isFinite(n) ? n : null
}

/**
 * Flags an option set that fails any of four cheap heuristics:
 *
 *  - `length_asymmetry` — some option is under 40% the length of the longest
 *    option. A conspicuously short "throwaway" option is a classic tell.
 *  - `duplicate_options` — two options are identical or near-identical
 *    (>=80% similar) after normalization. Students can eliminate one on
 *    sight without engaging with the question.
 *  - `none_or_all_of_above` — "none/all of the above" or "both X and Y"
 *    style combining options (never legitimate on a single-best-answer exam).
 *  - `numeric_outlier` — exactly one option isn't numeric while the rest
 *    are (e.g. `10, 12, 11, "Twelve"`). That format mismatch stands out
 *    without reading the question.
 *
 *    This rule intentionally does NOT flag numeric-only sets on magnitude
 *    alone (e.g. one value being 10x+ another). An earlier version compared
 *    each option's ratio to the sorted median and flagged anything past a
 *    fixed multiple — but ordinary geometric-progression and
 *    order-of-magnitude distractor sets (`1, 5, 25, 125`; `0.1, 1, 10, 100`;
 *    `3, 9, 27, 81`) are common and legitimate on a math entrance-exam bank,
 *    and no fixed threshold separates them from a genuinely broken outlier:
 *    with a 4-option set the sorted-median pivot is asymmetric, so a
 *    geometric progression's low-end ratio shrinks quadratically with the
 *    common ratio while its high-end ratio only grows linearly, and a
 *    max/min-ratio reformulation fares no better (`0.1, 1, 10, 100` has a
 *    larger max/min spread than plenty of genuinely-fine sets). Rather than
 *    chase an unreliable threshold, this rule keeps only the mixed
 *    numeric/non-numeric signal, which is a format tell, not a magnitude
 *    guess.
 *
 * Options with fewer than 2 non-empty entries have nothing to compare and
 * are always reported clean.
 */
export function flagWeakOptions(options: string[]): WeakOptionsResult {
  const flags = new Set<WeakOptionFlag>()
  const trimmed = (Array.isArray(options) ? options : [])
    .map(o => (typeof o === 'string' ? o.trim() : ''))
    .filter(o => o.length > 0)

  if (trimmed.length < 2) return { flags: [], clean: true }

  // Rule 1 — length asymmetry
  const maxLen = Math.max(...trimmed.map(o => o.length))
  if (maxLen > 0 && trimmed.some(o => o.length < maxLen * 0.4)) {
    flags.add('length_asymmetry')
  }

  // Rule 2 — duplicate / near-duplicate options
  const normalized = trimmed.map(normalize)
  duplicateSearch: for (let i = 0; i < normalized.length; i++) {
    for (let j = i + 1; j < normalized.length; j++) {
      if (isNearDuplicate(normalized[i]!, normalized[j]!)) {
        flags.add('duplicate_options')
        break duplicateSearch
      }
    }
  }

  // Rule 3 — "none/all of the above" / combining options
  if (trimmed.some(o => NONE_ALL_PATTERN.test(o))) {
    flags.add('none_or_all_of_above')
  }

  // Rule 4 — mixed numeric / non-numeric options. Deliberately does NOT
  // flag magnitude alone (see doc comment above) — geometric-progression and
  // order-of-magnitude distractor sets are legitimate and a fixed ratio
  // threshold can't tell them apart from a genuine outlier.
  const numericValues = trimmed.map(parseNumeric)
  const numericCount = numericValues.filter(n => n !== null).length
  if (numericCount >= 2 && numericCount !== trimmed.length) {
    flags.add('numeric_outlier')
  }

  return { flags: Array.from(flags), clean: flags.size === 0 }
}
