// Pure helpers for Home's "My Entrance Exams" top fold (FocusExamsFold).
// No React, no DB — fully unit-testable.
//
// The fold always renders FOCUS_EXAM_SLOT_COUNT (6) slots:
//   1. One 'focused' slot per exam the user has already added to Focus
//      (priority order, exam type only — school-level focus is excluded by
//      the caller before this function runs).
//   2. When fewer than MIN_FILLED_BEFORE_SUGGESTIONS (3) slots are filled,
//      'suggested' slots fill the gap from DEFAULT_SUGGESTED_EXAM_SLUGS
//      (skipping any default already in Focus).
//   3. Any remaining slots are 'blank' (the dashed "+" tile that opens the
//      exam picker modal).

export const FOCUS_EXAM_SLOT_COUNT = 6
const MIN_FILLED_BEFORE_SUGGESTIONS = 3

/** Default suggested exams — verified listing slugs (see supabase/migrations/007_seed_listings.sql). */
export const DEFAULT_SUGGESTED_EXAM_SLUGS: readonly string[] = ['upcat', 'acet', 'dcat-dlsu']

export interface FocusedExamLike {
  slug: string
  priority: number
  title: string
}

export type FocusExamSlot =
  | { kind: 'focused'; slug: string; title: string }
  | { kind: 'suggested'; slug: string; title: string }
  | { kind: 'blank' }

export interface BuildFocusExamSlotsOpts {
  /** Default suggestion slugs, in priority order. */
  defaults?: readonly string[]
  /** Display titles for default slugs (slug → title). Falls back to the slug itself. */
  defaultTitles?: Record<string, string>
  /** Total slot count. Defaults to FOCUS_EXAM_SLOT_COUNT (6). */
  slotCount?: number
}

/**
 * buildFocusExamSlots — deterministic 6-slot layout for the FocusExamsFold.
 * Never mutates its inputs. Always returns exactly `slotCount` entries.
 */
export function buildFocusExamSlots(
  focusedExams: FocusedExamLike[],
  opts: BuildFocusExamSlotsOpts = {},
): FocusExamSlot[] {
  const slotCount = opts.slotCount ?? FOCUS_EXAM_SLOT_COUNT
  const defaults = opts.defaults ?? DEFAULT_SUGGESTED_EXAM_SLUGS
  const defaultTitles = opts.defaultTitles ?? {}

  const focused = [...focusedExams]
    .sort((a, b) => a.priority - b.priority)
    .slice(0, slotCount)
  const focusedSlugSet = new Set(focused.map(f => f.slug))

  const slots: FocusExamSlot[] = focused.map(f => ({ kind: 'focused', slug: f.slug, title: f.title }))

  if (slots.length < MIN_FILLED_BEFORE_SUGGESTIONS) {
    for (const slug of defaults) {
      if (slots.length >= MIN_FILLED_BEFORE_SUGGESTIONS || slots.length >= slotCount) break
      if (focusedSlugSet.has(slug)) continue
      slots.push({ kind: 'suggested', slug, title: defaultTitles[slug] ?? slug.toUpperCase() })
    }
  }

  while (slots.length < slotCount) slots.push({ kind: 'blank' })

  return slots
}

// ── Acronym derivation ───────────────────────────────────────────────────────

const ACRONYM_SKIP_WORDS = new Set(['of', 'the', 'and', 'for', 'de', 'la', 'a', 'an'])

/**
 * examAcronym — the monogram text for an exam tile.
 *   1. A known blueprint acronym always wins (authoritative, e.g. "UPCAT").
 *   2. Listing titles are commonly formatted "ACRONYM – Full name…" — split on
 *      the dash and use the leading segment when it reads like an acronym
 *      (short, all caps/digits/dashes).
 *   3. Otherwise, derive initials from the significant words in the title.
 */
export function examAcronym(title: string, blueprintAcronym?: string | null): string {
  if (blueprintAcronym) return blueprintAcronym

  const dashSplit = title.split(/\s[–—-]\s/)[0]?.trim()
  if (dashSplit && dashSplit.length <= 10 && /^[A-Z0-9][A-Z0-9\- ]*$/.test(dashSplit)) {
    return dashSplit
  }

  const words = title.split(/\s+/).filter(w => w && !ACRONYM_SKIP_WORDS.has(w.toLowerCase()))
  const initials = words.slice(0, 4).map(w => w[0]?.toUpperCase() ?? '').join('')
  if (initials) return initials.slice(0, 5)

  return title.trim().slice(0, 4).toUpperCase() || '?'
}

// ── Exam picker modal options ────────────────────────────────────────────────

export interface ExamPickerOption {
  slug: string
  title: string
  acronym: string
}

export const EXAM_PICKER_LIMIT = 9

/**
 * buildExamPickerOptions — the 3×3 exam-picker grid's contents: blueprint-backed
 * exams first (in blueprint displayOrder), then the remaining exam listings,
 * excluding anything already in Focus. Capped to `limit` (default 9).
 */
export function buildExamPickerOptions(
  examListings: ReadonlyArray<{ slug: string; title: string }>,
  blueprintSlugs: readonly string[],
  blueprintInfo: ReadonlyMap<string, { acronym: string; name: string }>,
  excludeSlugs: ReadonlySet<string>,
  limit: number = EXAM_PICKER_LIMIT,
): ExamPickerOption[] {
  const bySlug = new Map(examListings.map(l => [l.slug, l]))
  const ordered: string[] = []
  for (const slug of blueprintSlugs) {
    if (bySlug.has(slug) && !excludeSlugs.has(slug)) ordered.push(slug)
  }
  for (const l of examListings) {
    if (!ordered.includes(l.slug) && !excludeSlugs.has(l.slug)) ordered.push(l.slug)
  }
  return ordered.slice(0, limit).map(slug => {
    const l = bySlug.get(slug)!
    const bp = blueprintInfo.get(slug)
    return { slug, title: l.title, acronym: examAcronym(l.title, bp?.acronym) }
  })
}
