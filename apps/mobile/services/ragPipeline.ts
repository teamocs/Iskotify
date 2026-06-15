/**
 * Edge RAG pipeline — Task C
 *
 * Retrieves context in parallel from all four builders, then ranks, trims, and
 * assembles a single `blocks` string within token budget constraints.
 *
 * TOKEN BUDGET:
 *   - Total cap: 700 tokens
 *   - Per-block cap: 280 chars (70 tokens)
 *   - Trim at line boundary (keep whole lines)
 *   - Drop lowest-priority blocks first if total still over budget
 *   - Never emit a header-only / empty block
 */

import type { DrizzleClient } from '../db/client'
import type { HomeStats } from '../hooks/useHomeStats'
import type { AiChatConfig } from './aiConfig'
import {
  buildProgressContext,
  buildRetrievedFlashcards,
  buildListingsContext,
  buildCourseConnectionContext,
  buildTopSchoolsContext,
  buildCareerDestinationsContext,
} from './chatContext'

export type RagMode = 'progress' | 'topic' | 'math'

export interface RagResult {
  blocks: string
  sources: string[]
}

const BUILTIN_TOTAL_TOKEN_BUDGET = 700
const BUILTIN_PER_BLOCK_CHAR_CAP = 280

/**
 * Estimate tokens from a string: ceil(chars / 4). Pure, unit-tested.
 */
export function estimateTokens(s: string): number {
  if (!s) return 0
  return Math.ceil(s.length / 4)
}

/**
 * Trim a block to at most `charCap` characters at a line boundary.
 * Keeps whole lines — never emits a partial line.
 * Returns the original string when it fits within the cap.
 */
function trimAtLineBoundary(block: string, charCap: number): string {
  if (block.length <= charCap) return block
  const lines = block.split('\n')
  const kept: string[] = []
  let total = 0
  for (const line of lines) {
    // +1 for the newline we'd join back
    const cost = line.length + (kept.length > 0 ? 1 : 0)
    if (total + cost > charCap) break
    kept.push(line)
    total += cost
  }
  return kept.join('\n')
}

/**
 * Determine whether a raw builder output should be treated as "has content"
 * (non-empty string, not just whitespace). Accepts string | null | undefined.
 */
function hasContent(s: string | null | undefined): s is string {
  return typeof s === 'string' && s.trim().length > 0
}

/**
 * Build the assembled RAG context from all four builders.
 *
 * Retrieval is parallel. Prioritisation and budgeting happen synchronously
 * after all four promises settle.
 *
 * Priority orders per mode (highest → lowest):
 *   math:            flashcards > listings > courses > schools > destinations > progress
 *   progress:        progress > flashcards > listings > courses > schools > destinations
 *   topic (listing): listings > courses > schools > destinations > flashcards > progress
 *   topic (default): flashcards > listings > courses > schools > destinations > progress
 *
 * "listing intent" = listings block came back non-empty.
 *
 * @param cfg - Optional remote AI config. When provided:
 *   - ragTotalTokenBudget / ragPerBlockCharCap override the builtin caps when > 0.
 *   - ragBlocksEnabled.{name}=false skips that builder entirely. schools/destinations
 *     default to enabled (absent key = enabled) since they post-date the cfg type.
 */
export async function buildRagContext(
  db: DrizzleClient,
  question: string,
  mode: RagMode,
  stats: HomeStats,
  cfg?: AiChatConfig,
): Promise<RagResult> {
  // Resolve effective budget caps from cfg (if provided and > 0) or builtins.
  const TOTAL_TOKEN_BUDGET = cfg?.ragTotalTokenBudget ?? BUILTIN_TOTAL_TOKEN_BUDGET
  const PER_BLOCK_CHAR_CAP = cfg?.ragPerBlockCharCap ?? BUILTIN_PER_BLOCK_CHAR_CAP

  // Resolve which blocks are enabled (default all true when cfg absent).
  // schools/destinations were added after aiConfig's strict type was frozen, so
  // they're read defensively (absent key = enabled), mirroring the "absent =
  // enabled" semantics the other flags already use.
  const cfgBlocks = cfg?.ragBlocksEnabled as
    | (Record<string, boolean | undefined>)
    | undefined
  const blocksEnabled = {
    flashcards:   cfgBlocks?.flashcards   !== false,
    listings:     cfgBlocks?.listings     !== false,
    courses:      cfgBlocks?.courses      !== false,
    progress:     cfgBlocks?.progress     !== false,
    schools:      cfgBlocks?.schools      !== false,
    destinations: cfgBlocks?.destinations !== false,
  }

  // ── Stage 1: retrieve in parallel (skip disabled blocks) ─────────────────
  const [progressRaw, flashcardsRaw, listingsRaw, coursesRaw, schoolsRaw, destinationsRaw] = await Promise.all([
    blocksEnabled.progress     ? buildProgressContext(db, stats)              : Promise.resolve(''),
    blocksEnabled.flashcards   ? buildRetrievedFlashcards(db, question, 3)    : Promise.resolve(''),
    blocksEnabled.listings     ? buildListingsContext(db, question)           : Promise.resolve(''),
    blocksEnabled.courses      ? buildCourseConnectionContext(db, question)   : Promise.resolve(''),
    blocksEnabled.schools      ? buildTopSchoolsContext(db, question)         : Promise.resolve(''),
    blocksEnabled.destinations ? buildCareerDestinationsContext(db, question) : Promise.resolve(''),
  ])

  // ── Stage 2: collect named blocks ────────────────────────────────────────
  const named: Array<{ name: string; content: string }> = []

  if (hasContent(progressRaw)) named.push({ name: 'progress', content: progressRaw })
  if (hasContent(flashcardsRaw)) named.push({ name: 'flashcards', content: flashcardsRaw })
  if (hasContent(listingsRaw)) named.push({ name: 'listings', content: listingsRaw })
  if (hasContent(coursesRaw)) named.push({ name: 'courses', content: coursesRaw })
  if (hasContent(schoolsRaw)) named.push({ name: 'schools', content: schoolsRaw })
  if (hasContent(destinationsRaw)) named.push({ name: 'destinations', content: destinationsRaw })

  if (named.length === 0) return { blocks: '', sources: [] }

  // ── Stage 3: per-block trim at character boundary ─────────────────────────
  const trimmed = named.map(b => ({
    name: b.name,
    content: trimAtLineBoundary(b.content, PER_BLOCK_CHAR_CAP),
  }))

  // ── Stage 4: rank by mode priority ───────────────────────────────────────
  const listingIntentTopic = mode === 'topic' && hasContent(listingsRaw)

  // schools + destinations sit after listings/courses but above progress for
  // listing-intent and default topic modes (data-grounded answers to "top
  // schools" / "jobs abroad" questions). In math/progress modes they rank just
  // above progress's tail so they can still surface but never crowd out the
  // mode's primary block.
  const priority: string[] =
    mode === 'math'
      ? ['flashcards', 'listings', 'courses', 'schools', 'destinations', 'progress']
      : mode === 'progress'
        ? ['progress', 'flashcards', 'listings', 'courses', 'schools', 'destinations']
        : listingIntentTopic
          ? ['listings', 'courses', 'schools', 'destinations', 'flashcards', 'progress']
          : ['flashcards', 'listings', 'courses', 'schools', 'destinations', 'progress'] // default topic

  // Sort trimmed blocks by priority (lower index = higher priority)
  const ranked = [...trimmed].sort((a, b) => {
    const ai = priority.indexOf(a.name)
    const bi = priority.indexOf(b.name)
    const aRank = ai === -1 ? 9999 : ai
    const bRank = bi === -1 ? 9999 : bi
    return aRank - bRank
  })

  // ── Stage 5: total budget — drop from the END of the priority list ────────
  const included: Array<{ name: string; content: string }> = []
  let totalChars = 0

  for (const block of ranked) {
    const blockChars = block.content.length
    const sep = included.length > 0 ? 2 : 0 // '\n\n' between blocks
    // Token estimate of the RUNNING CHARACTER TOTAL (chars/4), not of a
    // stringified number — a previous `+ ''` coercion here silently defeated
    // the whole budget check (estimateTokens("1302") === 1).
    if (Math.ceil((totalChars + sep + blockChars) / 4) <= TOTAL_TOKEN_BUDGET) {
      included.push(block)
      totalChars += sep + blockChars
    }
    // When over budget: skip this block (it's lower priority than already-included ones)
  }

  // ── Stage 6: drop any that became empty after trim ────────────────────────
  const final = included.filter(b => b.content.trim().length > 0)

  if (final.length === 0) return { blocks: '', sources: [] }

  const blocks = final.map(b => b.content).join('\n\n')
  const sources = final.map(b => b.name)

  return { blocks, sources }
}
