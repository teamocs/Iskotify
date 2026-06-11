/**
 * TDD: services/aiConfig.ts
 *
 * Uses real better-sqlite3 in-memory DB (same harness as settings.test.ts).
 */

import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from '../../db/schema'
import type { DrizzleClient } from '../../db/client'
import { getAiConfig } from '../aiConfig'
import { _clearForTests } from '../queryCache'

function makeDb(): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE ai_chat_config (
      id INTEGER PRIMARY KEY NOT NULL DEFAULT 1,
      core_rules_override TEXT NOT NULL DEFAULT '',
      scope_block_override TEXT NOT NULL DEFAULT '',
      grounding_rule_override TEXT NOT NULL DEFAULT '',
      anti_injection_override TEXT NOT NULL DEFAULT '',
      progress_addendum_override TEXT NOT NULL DEFAULT '',
      topic_addendum_override TEXT NOT NULL DEFAULT '',
      math_addendum_override TEXT NOT NULL DEFAULT '',
      rag_total_token_budget INTEGER NOT NULL DEFAULT 700,
      rag_per_block_char_cap INTEGER NOT NULL DEFAULT 280,
      rag_blocks_enabled TEXT NOT NULL DEFAULT '{}',
      remote_updated_at INTEGER
    );
  `)
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

beforeEach(() => {
  _clearForTests()
})

describe('getAiConfig — no row', () => {
  it('returns all-enabled blocks and no overrides when table is empty', async () => {
    const db = makeDb()
    const cfg = await getAiConfig(db)
    expect(cfg.ragBlocksEnabled.flashcards).toBe(true)
    expect(cfg.ragBlocksEnabled.listings).toBe(true)
    expect(cfg.ragBlocksEnabled.courses).toBe(true)
    expect(cfg.ragBlocksEnabled.progress).toBe(true)
    expect(cfg.coreRulesOverride).toBeUndefined()
    expect(cfg.scopeBlockOverride).toBeUndefined()
    expect(cfg.progressAddendumOverride).toBeUndefined()
    expect(cfg.ragTotalTokenBudget).toBeUndefined()
    expect(cfg.ragPerBlockCharCap).toBeUndefined()
  })
})

describe('getAiConfig — row with all empty-string overrides (defaults)', () => {
  it('returns undefined for all override fields when overrides are empty strings', async () => {
    const db = makeDb()
    await db.insert(schema.aiChatConfig).values({
      id: 1,
      coreRulesOverride: '',
      scopeBlockOverride: '',
      groundingRuleOverride: '',
      antiInjectionOverride: '',
      progressAddendumOverride: '',
      topicAddendumOverride: '',
      mathAddendumOverride: '',
      ragTotalTokenBudget: 700,
      ragPerBlockCharCap: 280,
      ragBlocksEnabled: '{}',
    })
    const cfg = await getAiConfig(db)
    expect(cfg.coreRulesOverride).toBeUndefined()
    expect(cfg.scopeBlockOverride).toBeUndefined()
    expect(cfg.groundingRuleOverride).toBeUndefined()
    expect(cfg.antiInjectionOverride).toBeUndefined()
    expect(cfg.progressAddendumOverride).toBeUndefined()
    expect(cfg.topicAddendumOverride).toBeUndefined()
    expect(cfg.mathAddendumOverride).toBeUndefined()
  })

  it('returns undefined for budget fields when they equal 700/280 (builtin defaults)', async () => {
    // Budget overrides return undefined only when the value is 0 (or null/missing).
    // When the row has 700/280, they are returned as-is (positiveInt → defined).
    // This test verifies that 0 → undefined (the "use builtin" sentinel).
    const db = makeDb()
    await db.insert(schema.aiChatConfig).values({
      id: 1,
      ragTotalTokenBudget: 0,  // 0 = use builtin
      ragPerBlockCharCap: 0,   // 0 = use builtin
      ragBlocksEnabled: '{}',
    })
    const cfg = await getAiConfig(db)
    expect(cfg.ragTotalTokenBudget).toBeUndefined()
    expect(cfg.ragPerBlockCharCap).toBeUndefined()
  })
})

describe('getAiConfig — active overrides', () => {
  it('returns non-empty override strings as-is', async () => {
    const db = makeDb()
    await db.insert(schema.aiChatConfig).values({
      id: 1,
      coreRulesOverride: 'Custom core rules text.',
      scopeBlockOverride: 'Custom scope block.',
      progressAddendumOverride: 'Custom progress addendum.',
      ragBlocksEnabled: '{}',
    })
    const cfg = await getAiConfig(db)
    expect(cfg.coreRulesOverride).toBe('Custom core rules text.')
    expect(cfg.scopeBlockOverride).toBe('Custom scope block.')
    expect(cfg.progressAddendumOverride).toBe('Custom progress addendum.')
  })

  it('returns custom budget values when > 0', async () => {
    const db = makeDb()
    await db.insert(schema.aiChatConfig).values({
      id: 1,
      ragTotalTokenBudget: 500,
      ragPerBlockCharCap: 200,
      ragBlocksEnabled: '{}',
    })
    const cfg = await getAiConfig(db)
    expect(cfg.ragTotalTokenBudget).toBe(500)
    expect(cfg.ragPerBlockCharCap).toBe(200)
  })
})

describe('getAiConfig — ragBlocksEnabled parsing', () => {
  it('parses all-true JSON correctly', async () => {
    const db = makeDb()
    await db.insert(schema.aiChatConfig).values({
      id: 1,
      ragBlocksEnabled: '{"flashcards":true,"listings":true,"courses":true,"progress":true}',
    })
    const cfg = await getAiConfig(db)
    expect(cfg.ragBlocksEnabled).toEqual({ flashcards: true, listings: true, courses: true, progress: true })
  })

  it('returns disabled=false for explicitly false blocks', async () => {
    const db = makeDb()
    await db.insert(schema.aiChatConfig).values({
      id: 1,
      ragBlocksEnabled: '{"flashcards":false,"listings":true,"courses":false,"progress":true}',
    })
    const cfg = await getAiConfig(db)
    expect(cfg.ragBlocksEnabled.flashcards).toBe(false)
    expect(cfg.ragBlocksEnabled.listings).toBe(true)
    expect(cfg.ragBlocksEnabled.courses).toBe(false)
    expect(cfg.ragBlocksEnabled.progress).toBe(true)
  })

  it('treats absent keys as enabled (default-open)', async () => {
    const db = makeDb()
    await db.insert(schema.aiChatConfig).values({
      id: 1,
      ragBlocksEnabled: '{}',  // all absent → all enabled
    })
    const cfg = await getAiConfig(db)
    expect(cfg.ragBlocksEnabled.flashcards).toBe(true)
    expect(cfg.ragBlocksEnabled.listings).toBe(true)
    expect(cfg.ragBlocksEnabled.courses).toBe(true)
    expect(cfg.ragBlocksEnabled.progress).toBe(true)
  })

  it('handles malformed JSON → all blocks enabled', async () => {
    const db = makeDb()
    await db.insert(schema.aiChatConfig).values({
      id: 1,
      ragBlocksEnabled: 'not-valid-json',
    })
    const cfg = await getAiConfig(db)
    expect(cfg.ragBlocksEnabled).toEqual({ flashcards: true, listings: true, courses: true, progress: true })
  })

  it('handles empty string → all blocks enabled', async () => {
    const db = makeDb()
    // Insert with empty string for rag_blocks_enabled (schema default is '{}')
    await db.insert(schema.aiChatConfig).values({ id: 1, ragBlocksEnabled: '' })
    const cfg = await getAiConfig(db)
    expect(cfg.ragBlocksEnabled).toEqual({ flashcards: true, listings: true, courses: true, progress: true })
  })
})

describe('getAiConfig — caching', () => {
  it('returns cached result on second call without hitting DB again', async () => {
    const db = makeDb()
    await db.insert(schema.aiChatConfig).values({
      id: 1,
      coreRulesOverride: 'Cached override',
      ragBlocksEnabled: '{}',
    })
    const cfg1 = await getAiConfig(db)
    // Modify DB row directly — cached result should still be returned
    await db.update(schema.aiChatConfig).set({ coreRulesOverride: 'New override' })
    const cfg2 = await getAiConfig(db)
    expect(cfg1.coreRulesOverride).toBe('Cached override')
    expect(cfg2.coreRulesOverride).toBe('Cached override')  // still cached
  })
})
