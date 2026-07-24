/**
 * services/aiConfig.ts
 *
 * Reads the remotely-managed AI chat config from the local SQLite mirror of
 * Supabase's `ai_chat_config` table (single row, id=1).
 *
 * Semantics:
 *   - override fields: used ONLY when the string is non-empty; otherwise undefined
 *     → caller falls back to the builtin string from chatPrompts.ts.
 *   - budget fields: used ONLY when > 0; otherwise undefined → caller uses builtin.
 *   - blocksEnabled: JSON.parse with try/catch — bad/absent JSON → all blocks true.
 *   - No row at all → all fields default (all overrides undefined, all blocks true).
 *
 * Cached for 5 minutes (300_000 ms) so every message in a conversation reads the
 * same config. A sync on next launch refreshes the SQLite row.
 */

import { eq } from 'drizzle-orm'
import type { DrizzleClient } from '../db/client'
import { aiChatConfig } from '../db/schema'
import { cachedQuery } from './queryCache'

export interface AiChatConfig {
  /** Text overrides — undefined means "use builtin". */
  coreRulesOverride?: string
  scopeBlockOverride?: string
  groundingRuleOverride?: string
  antiInjectionOverride?: string
  progressAddendumOverride?: string
  topicAddendumOverride?: string
  mathAddendumOverride?: string
  /** RAG budget overrides — undefined means "use builtin". */
  ragTotalTokenBudget?: number
  ragPerBlockCharCap?: number
  /** Per-block enable flags. Absent key = enabled. */
  ragBlocksEnabled: {
    flashcards: boolean
    listings: boolean
    courses: boolean
    progress: boolean
  }
  /**
   * Kuya Baw kill-switch. Retired by default — chat is hidden app-wide unless
   * an admin explicitly re-enables it remotely. Missing row/column → false
   * (fail-closed), unlike the override/budget fields above.
   */
  chatEnabled: boolean
}

const ALL_BLOCKS_ENABLED = { flashcards: true, listings: true, courses: true, progress: true }

function parseBlocksEnabled(raw: string | null | undefined): AiChatConfig['ragBlocksEnabled'] {
  if (!raw) return { ...ALL_BLOCKS_ENABLED }
  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return { ...ALL_BLOCKS_ENABLED }
    return {
      flashcards: parsed.flashcards !== false,
      listings:   parsed.listings !== false,
      courses:    parsed.courses !== false,
      progress:   parsed.progress !== false,
    }
  } catch {
    return { ...ALL_BLOCKS_ENABLED }
  }
}

function nonEmpty(s: string | null | undefined): string | undefined {
  return s && s.trim().length > 0 ? s : undefined
}

function positiveInt(n: number | null | undefined): number | undefined {
  return typeof n === 'number' && n > 0 ? n : undefined
}

/**
 * Load the AI chat config from local SQLite, cached for 5 minutes.
 * Never throws — returns all-defaults on any failure.
 */
export async function getAiConfig(db: DrizzleClient): Promise<AiChatConfig> {
  return cachedQuery('chat:ai-config', 300_000, async () => {
    try {
      const rows = await db.select().from(aiChatConfig).where(eq(aiChatConfig.id, 1)).limit(1)
      const row = rows[0]
      if (!row) {
        return { ragBlocksEnabled: { ...ALL_BLOCKS_ENABLED }, chatEnabled: false }
      }
      return {
        coreRulesOverride:        nonEmpty(row.coreRulesOverride),
        scopeBlockOverride:       nonEmpty(row.scopeBlockOverride),
        groundingRuleOverride:    nonEmpty(row.groundingRuleOverride),
        antiInjectionOverride:    nonEmpty(row.antiInjectionOverride),
        progressAddendumOverride: nonEmpty(row.progressAddendumOverride),
        topicAddendumOverride:    nonEmpty(row.topicAddendumOverride),
        mathAddendumOverride:     nonEmpty(row.mathAddendumOverride),
        ragTotalTokenBudget:      positiveInt(row.ragTotalTokenBudget),
        ragPerBlockCharCap:       positiveInt(row.ragPerBlockCharCap),
        ragBlocksEnabled:         parseBlocksEnabled(row.ragBlocksEnabled),
        // Missing/falsy column (including pre-migration rows) → disabled.
        chatEnabled:              row.chatEnabled === true,
      }
    } catch {
      return { ragBlocksEnabled: { ...ALL_BLOCKS_ENABLED }, chatEnabled: false }
    }
  })
}
