import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { eq } from 'drizzle-orm'
import * as schema from '../../db/schema'
import type { DrizzleClient } from '../../db/client'
import {
  loadFreshPhrases, pruneStalePhrases, insertPhrase,
  markConsumed, gcOldConsumed,
  getAcquiredRequirementIndices, toggleRequirement,
} from '../coachQueue'

function makeDb(): DrizzleClient {
  const raw = new Database(':memory:')
  raw.exec(`
    CREATE TABLE coach_phrases (
      id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
      category TEXT NOT NULL,
      text TEXT NOT NULL,
      generated_at INTEGER NOT NULL,
      context_hash TEXT NOT NULL,
      consumed INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE user_requirements (
      listing_slug TEXT NOT NULL,
      requirement_index INTEGER NOT NULL,
      acquired_at INTEGER NOT NULL,
      PRIMARY KEY (listing_slug, requirement_index)
    );
  `)
  // Cast — better-sqlite3 adapter satisfies the same Drizzle query API at runtime.
  // The DrizzleClient type comes from the expo-sqlite adapter in production.
  return drizzle(raw, { schema }) as unknown as DrizzleClient
}

describe('coachQueue — phrases', () => {
  it('loadFreshPhrases returns only unconsumed rows matching contextHash, in FIFO order', async () => {
    const db = makeDb()
    await insertPhrase(db, 'motivation', 'phrase A', 'h1')
    await new Promise(r => setTimeout(r, 5))
    await insertPhrase(db, 'streak', 'phrase B', 'h1')
    await insertPhrase(db, 'motivation', 'stale phrase', 'h2')

    const rows = await loadFreshPhrases(db, 'h1')
    expect(rows.length).toBe(2)
    expect(rows[0]!.text).toBe('phrase A')
    expect(rows[1]!.text).toBe('phrase B')
  })

  it('pruneStalePhrases deletes only unconsumed rows whose hash differs', async () => {
    const db = makeDb()
    await insertPhrase(db, 'motivation', 'keep', 'current')
    await insertPhrase(db, 'streak', 'drop', 'old')
    await insertPhrase(db, 'streak', 'keep consumed stale', 'old')
    await markConsumed(db, 3)

    await pruneStalePhrases(db, 'current')

    const all = await db.select().from(schema.coachPhrases)
    expect(all.length).toBe(2)
    const texts = all.map(r => r.text).sort()
    expect(texts).toEqual(['keep', 'keep consumed stale'])
  })

  it('markConsumed sets consumed=true without deleting the row', async () => {
    const db = makeDb()
    await insertPhrase(db, 'motivation', 'one', 'h1')
    await markConsumed(db, 1)
    const all = await db.select().from(schema.coachPhrases)
    expect(all.length).toBe(1)
    expect(all[0]!.consumed).toBe(true)
  })

  it('gcOldConsumed deletes consumed rows older than threshold', async () => {
    const db = makeDb()
    const dayMs = 86_400_000
    const now = Date.now()
    await insertPhrase(db, 'motivation', 'old consumed', 'h1')
    await db.update(schema.coachPhrases)
      .set({ generatedAt: now - 2 * dayMs })
      .where(eq(schema.coachPhrases.id, 1))
    await markConsumed(db, 1)
    await insertPhrase(db, 'streak', 'fresh consumed', 'h1')
    await markConsumed(db, 2)
    await insertPhrase(db, 'motivation', 'fresh unconsumed', 'h1')

    await gcOldConsumed(db, dayMs)

    const all = await db.select().from(schema.coachPhrases)
    expect(all.length).toBe(2)
    const texts = all.map(r => r.text).sort()
    expect(texts).toEqual(['fresh consumed', 'fresh unconsumed'])
  })
})

describe('coachQueue — requirements', () => {
  it('toggleRequirement(true) inserts a row', async () => {
    const db = makeDb()
    await toggleRequirement(db, 'upcat-2026', 0, true)
    const ids = await getAcquiredRequirementIndices(db, 'upcat-2026')
    expect(ids).toEqual([0])
  })

  it('toggleRequirement(false) deletes the row', async () => {
    const db = makeDb()
    await toggleRequirement(db, 'upcat-2026', 0, true)
    await toggleRequirement(db, 'upcat-2026', 0, false)
    const ids = await getAcquiredRequirementIndices(db, 'upcat-2026')
    expect(ids).toEqual([])
  })

  it('toggleRequirement(false) is a no-op on non-existent key', async () => {
    const db = makeDb()
    // Should not throw
    await toggleRequirement(db, 'upcat-2026', 99, false)
    const ids = await getAcquiredRequirementIndices(db, 'upcat-2026')
    expect(ids).toEqual([])
  })

  it('toggleRequirement(true) twice for same key is idempotent', async () => {
    const db = makeDb()
    await toggleRequirement(db, 'upcat-2026', 0, true)
    await toggleRequirement(db, 'upcat-2026', 0, true)
    const ids = await getAcquiredRequirementIndices(db, 'upcat-2026')
    expect(ids).toEqual([0])
  })

  it('getAcquiredRequirementIndices returns only matching listing', async () => {
    const db = makeDb()
    await toggleRequirement(db, 'upcat-2026', 0, true)
    await toggleRequirement(db, 'upcat-2026', 2, true)
    await toggleRequirement(db, 'dost-2026', 1, true)
    const ids = await getAcquiredRequirementIndices(db, 'upcat-2026')
    expect(ids.sort()).toEqual([0, 2])
  })
})
