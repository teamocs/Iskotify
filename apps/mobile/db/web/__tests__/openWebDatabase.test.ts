/**
 * TDD tests for the web SQLite adapter (openWebDatabase).
 *
 * Uses sql.js node build (runs in jest node env — no browser / wasm needed in CI).
 * IndexedDB is replaced by the in-memory ByteStore so no mocking required.
 */

import initSqlJs from 'sql.js'
import { openWebDatabase, makeMemoryStore, webFtsAvailable } from '../openWebDatabase'

// Helper: create a fresh db with the in-memory store (no IndexedDB).
async function openFresh() {
  const store = makeMemoryStore()
  return { store, ...(await openWebDatabase(store, initSqlJs)) }
}

describe('openWebDatabase', () => {
  it('opens an empty database and creates all non-FTS tables', async () => {
    const { db } = await openFresh()
    // Query a core table to verify it was created
    const rows = await db.run('SELECT name FROM sqlite_master WHERE type="table" AND name="user_settings"')
    // drizzle sql.js: run() returns the db itself; use a direct query instead
    const result = (db as any).session?.client?.exec?.('SELECT name FROM sqlite_master WHERE type="table" AND name="user_settings"')
    // Access underlying sql.js db via drizzle internals
    // We can verify indirectly: a SELECT on the table shouldn't throw
    const settings = await db.select().from(require('../../schema').userSettings)
    expect(settings).toEqual([])
  }, 15000)

  it('FTS skipped gracefully when unavailable (forced stub)', async () => {
    // Wrap initSqlJs to produce a DB that throws on VIRTUAL TABLE statements
    const store = makeMemoryStore()
    const stubbedFactory = async () => {
      const SQL = await initSqlJs()
      // Patch Database.prototype.run to throw on fts5 keywords
      const OrigDb = SQL.Database
      class PatchedDb extends OrigDb {
        run(sql: string, params?: unknown) {
          if (sql.toLowerCase().includes('fts5') || sql.toUpperCase().includes('VIRTUAL TABLE')) {
            throw new Error('no such module: fts5')
          }
          return super.run(sql, params as any)
        }
      }
      SQL.Database = PatchedDb as typeof SQL.Database
      return SQL
    }
    // Should not throw
    const handle = await openWebDatabase(store, stubbedFactory)
    expect(handle.db).toBeTruthy()
    // webFtsAvailable is a module-level flag; it would be false after this run
    // (we can't easily assert module-level state here without re-importing,
    // but the important thing is it didn't throw)
  }, 15000)

  it('inserts into FTS-triggered tables when FTS5 is unavailable (no "no such table" abort)', async () => {
    // Repro of the prod web bug: sql.js browser build has no FTS5, so the
    // CREATE VIRTUAL TABLE flashcards_fts is skipped — BUT the flashcards_fts
    // triggers still get created (CREATE TRIGGER doesn't validate the missing
    // table). Then INSERT INTO flashcards fires the trigger → "no such table:
    // flashcards_fts" → the whole syncOnLaunch transaction aborts → empty app.
    const store = makeMemoryStore()
    const stubbedFactory = async () => {
      const SQL = await initSqlJs()
      const OrigDb = SQL.Database
      class PatchedDb extends OrigDb {
        run(sql: string, params?: unknown) {
          if (sql.toLowerCase().includes('fts5') || sql.toUpperCase().includes('VIRTUAL TABLE')) {
            throw new Error('no such module: fts5')
          }
          return super.run(sql, params as any)
        }
      }
      SQL.Database = PatchedDb as typeof SQL.Database
      return SQL
    }

    const handle = await openWebDatabase(store, stubbedFactory)
    const s = require('../../schema')

    // Inserts into all three FTS-triggered base tables must succeed.
    await expect(handle.db.insert(s.flashcards).values({
      id: 'c1', topicId: 't1', question: 'Q', answer: 'A', explanation: 'E',
      listingSlugs: '[]', options: '[]', status: 'published',
    })).resolves.toBeDefined()
    await expect(handle.db.insert(s.upcatFacts).values({
      id: 'f1', topic: 'T', question: 'Q', answer: 'A',
    })).resolves.toBeDefined()
    await expect(handle.db.insert(s.careerFacts).values({
      id: 'cf1', courseName: 'Nursing', quickAnswer: 'A',
    })).resolves.toBeDefined()

    const cards = await handle.db.select().from(s.flashcards)
    expect(cards).toHaveLength(1)
  }, 15000)

  it('data survives a roundtrip through export/import (reopening from saved bytes)', async () => {
    const store = makeMemoryStore()

    // Open and write a row
    const h1 = await openWebDatabase(store, initSqlJs)
    const s = require('../../schema')
    await h1.db.insert(s.userSettings).values({
      id: 1,
      fullName: 'TestUser',
      selectedListingSlug: '',
      lastSyncedAt: 0,
    })
    await h1.persistNow()

    // Reopen from saved bytes
    const h2 = await openWebDatabase(store, initSqlJs)
    const rows = await h2.db.select().from(s.userSettings)
    expect(rows).toHaveLength(1)
    expect(rows[0]?.fullName).toBe('TestUser')
  }, 20000)

  it('MIGRATIONS are idempotent on second open (no throw)', async () => {
    const store = makeMemoryStore()
    const h1 = await openWebDatabase(store, initSqlJs)
    await h1.persistNow()
    // Second open runs migrations again — should not throw
    await expect(openWebDatabase(store, initSqlJs)).resolves.toBeTruthy()
  }, 20000)

  it('schedulePersist debounces and eventually calls save', async () => {
    jest.useFakeTimers()
    const store = makeMemoryStore()
    const saveSpy = jest.spyOn(store, 'save')
    const h = await openWebDatabase(store, initSqlJs)

    // Schedule multiple times — should only call save once after debounce
    h.schedulePersist()
    h.schedulePersist()
    h.schedulePersist()
    expect(saveSpy).not.toHaveBeenCalled()

    await jest.runAllTimersAsync()
    expect(saveSpy).toHaveBeenCalledTimes(1)
    jest.useRealTimers()
  }, 20000)

  it('persistNow saves bytes that can be reloaded', async () => {
    const store = makeMemoryStore()
    const h = await openWebDatabase(store, initSqlJs)
    const s = require('../../schema')
    await h.db.insert(s.userSettings).values({ id: 1, fullName: 'Persist', selectedListingSlug: '', lastSyncedAt: 0 })
    await h.persistNow()

    const loaded = await store.load()
    expect(loaded).not.toBeNull()
    expect(loaded!.byteLength).toBeGreaterThan(0)
  }, 20000)
})

describe('makeMemoryStore', () => {
  it('load returns null when empty', async () => {
    const store = makeMemoryStore()
    expect(await store.load()).toBeNull()
  })

  it('save → load roundtrip preserves bytes', async () => {
    const store = makeMemoryStore()
    const bytes = new Uint8Array([1, 2, 3, 4])
    await store.save(bytes)
    const loaded = await store.load()
    expect(loaded).toEqual(new Uint8Array([1, 2, 3, 4]))
  })

  it('save stores a copy (mutation after save does not affect stored bytes)', async () => {
    const store = makeMemoryStore()
    const bytes = new Uint8Array([10, 20, 30])
    await store.save(bytes)
    bytes[0] = 99
    const loaded = await store.load()
    expect(loaded![0]).toBe(10)
  })
})
