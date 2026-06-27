/**
 * Web database adapter — sql.js + IndexedDB persistence.
 *
 * Wasm strategy: `sql-wasm.wasm` is copied into `public/` so Expo's web export
 * copies it to the dist root. `locateFile` returns `/sql-wasm.wasm` (absolute
 * path works both at the dist root and when served locally). In jest/node the
 * sql.js node build is used directly (no wasm needed — initSqlJs auto-selects
 * asm.js in node if wasm is absent, or we pass the wasm Buffer directly).
 *
 * Persistence: bytes are saved to IndexedDB (database "iskotify", store "sqlite",
 * key "main") after writes. A 2-second debounce keeps writes cheap. A
 * `visibilitychange → hidden` listener flushes immediately on tab-close.
 *
 * FTS5: sql.js's wasm build does NOT include FTS5 by default. We attempt every
 * FTS5-dependent SQL statement inside a try/catch and set `webFtsAvailable` to
 * false if any of them fail. Callers read this flag to switch to LIKE fallback.
 */

import type { SqlJsStatic, Database as SqlJsDatabase } from 'sql.js'
import { drizzle } from 'drizzle-orm/sql-js'
import * as schema from '../schema'
import { CREATE_SQL, MIGRATIONS } from '../client'

// ── Public FTS availability flag ────────────────────────────────────────────

/** True when FTS5 is available in the current sql.js build. Set on first open. */
export let webFtsAvailable = false

// ── Byte store abstraction (lets tests inject in-memory impl) ──────────────

export interface ByteStore {
  load(): Promise<Uint8Array | null>
  save(bytes: Uint8Array): Promise<void>
}

/** Production IndexedDB byte store. */
export function makeIndexedDbStore(): ByteStore {
  const DB_NAME = 'iskotify'
  const STORE_NAME = 'sqlite'
  const KEY = 'main'

  function openIdb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        req.result.createObjectStore(STORE_NAME)
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  }

  return {
    async load(): Promise<Uint8Array | null> {
      const idb = await openIdb()
      return new Promise((resolve, reject) => {
        const tx = idb.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).get(KEY)
        req.onsuccess = () => resolve(req.result ? new Uint8Array(req.result as ArrayBuffer) : null)
        req.onerror = () => reject(req.error)
      })
    },
    async save(bytes: Uint8Array): Promise<void> {
      const idb = await openIdb()
      return new Promise((resolve, reject) => {
        const tx = idb.transaction(STORE_NAME, 'readwrite')
        const req = tx.objectStore(STORE_NAME).put(bytes.buffer, KEY)
        req.onsuccess = () => resolve()
        req.onerror = () => reject(req.error)
      })
    },
  }
}

/** In-memory byte store for tests (no IndexedDB). */
export function makeMemoryStore(): ByteStore {
  let stored: Uint8Array | null = null
  return {
    async load() { return stored },
    async save(bytes) { stored = bytes.slice() },
  }
}

// ── FTS-safe SQL runner ─────────────────────────────────────────────────────

// Matches FTS5 virtual tables AND every statement that depends on an _fts table:
// the sync triggers (CREATE TRIGGER … flashcards_fts_*) and the one-time
// INSERT … SELECT backfills. Critically this includes the triggers/backfills by
// table name — CREATE TRIGGER does NOT error when its _fts table is missing (the
// missing table only surfaces when the trigger fires on INSERT), so these must be
// skipped PROACTIVELY when FTS5 is absent, or the first sync INSERT throws
// "no such table: <x>_fts" and aborts the whole transaction.
function isFtsStatement(stmt: string): boolean {
  const upper = stmt.toUpperCase()
  return (
    upper.includes('FTS5') ||
    upper.includes('VIRTUAL TABLE') ||
    upper.includes('FLASHCARDS_FTS') ||
    upper.includes('UPCAT_FACTS_FTS') ||
    upper.includes('CAREER_FACTS_FTS')
  )
}

function runStatementsSafe(
  sqlDb: SqlJsDatabase,
  statements: string[],
  ftsSupported: boolean,
): { ftsAvailable: boolean } {
  let ftsAvailable = ftsSupported
  for (const stmt of statements) {
    const trimmed = stmt.trim()
    if (!trimmed) continue
    // FTS5 unavailable → skip every fts-dependent statement (virtual table,
    // trigger, backfill) BEFORE running it. Skipping only on error is not enough:
    // CREATE TRIGGER succeeds against a missing _fts table and detonates later.
    if (!ftsAvailable && isFtsStatement(trimmed)) continue
    try {
      sqlDb.run(trimmed)
    } catch (err) {
      if (isFtsStatement(trimmed)) {
        ftsAvailable = false
        console.warn('[webDb] FTS5 statement skipped (not supported in this sql.js build):', trimmed.slice(0, 80))
      } else {
        // Non-FTS errors: treat as already-exists / idempotent (same as native try/catch)
        // Only log at debug level to avoid noise for expected ALTER TABLE duplicate column errors
        const msg = (err as Error).message ?? ''
        if (!msg.includes('already exists') && !msg.includes('duplicate column')) {
          console.warn('[webDb] SQL statement skipped:', msg, trimmed.slice(0, 80))
        }
      }
    }
  }
  return { ftsAvailable }
}

// ── Core open function ──────────────────────────────────────────────────────

export type WebDrizzleClient = ReturnType<typeof drizzle>

export interface WebDatabaseHandle {
  /** The drizzle client — same contract as native DrizzleClient. */
  db: WebDrizzleClient
  /** Flush db bytes to the byte store immediately. */
  persistNow(): Promise<void>
  /** Schedule a persist ~2s from now (debounced). Call after any write. */
  schedulePersist(): void
}

/**
 * Open (or reopen from saved bytes) the web SQLite database.
 *
 * @param store  Byte store impl (IndexedDB in browser; MemoryStore in tests).
 * @param initSqlJs  Optional override — pass the node sql.js factory in tests.
 */
export async function openWebDatabase(
  store: ByteStore = makeIndexedDbStore(),
  initSqlJs?: (cfg?: object) => Promise<SqlJsStatic>,
): Promise<WebDatabaseHandle> {
  // Load sql.js — in node (jest) we use the standard require which auto-selects
  // the asm/wasm build appropriate for the environment.
  let SQL: SqlJsStatic
  if (initSqlJs) {
    SQL = await initSqlJs()
  } else {
    // Browser: the default export is the factory function; wasm is in /sql-wasm.wasm
    const mod = await import('sql.js')
    const factory = (mod.default ?? mod) as (cfg?: object) => Promise<SqlJsStatic>
    SQL = await factory({ locateFile: () => '/sql-wasm.wasm' })
  }

  // Load saved bytes from store (null = fresh database)
  const savedBytes = await store.load()
  const sqlDb: SqlJsDatabase = savedBytes ? new SQL.Database(savedBytes) : new SQL.Database()

  // Run CREATE_SQL (split on `;` boundaries for per-statement exec)
  // CREATE_SQL may have multi-statement blocks; run each separately.
  const createStatements = CREATE_SQL
    .split(';')
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s + ';')

  // Probe FTS5 support up front. The browser sql.js wasm build ships WITHOUT
  // FTS5; Node's build has it (which is why this bug never showed in tests).
  // Detecting it here lets runStatementsSafe skip the FTS virtual tables AND their
  // triggers/backfills proactively — the triggers are the dangerous part: they
  // create fine against a missing _fts table, then abort the first sync INSERT.
  let ftsSupported = true
  try {
    sqlDb.run('CREATE VIRTUAL TABLE IF NOT EXISTS __isk_fts_probe USING fts5(x)')
    try { sqlDb.run('DROP TABLE IF EXISTS __isk_fts_probe') } catch { /* ignore */ }
  } catch {
    ftsSupported = false
  }

  // Heal DBs persisted by an older build. A previous version created the *_fts
  // triggers (CREATE TRIGGER succeeds against a missing FTS table) and the
  // visibilitychange/pagehide flush saved that DB into IndexedDB. On reopen the
  // orphaned triggers are already baked in, so skipping CREATE TRIGGER isn't
  // enough — they must be DROPPED, or the first sync INSERT fires one and aborts
  // ("no such table: *_fts"). Only runs when FTS5 is unavailable (i.e. web).
  if (!ftsSupported) {
    const FTS_CLEANUP = [
      'DROP TRIGGER IF EXISTS flashcards_fts_ai',
      'DROP TRIGGER IF EXISTS flashcards_fts_ad',
      'DROP TRIGGER IF EXISTS flashcards_fts_au',
      'DROP TRIGGER IF EXISTS upcat_facts_fts_ai',
      'DROP TRIGGER IF EXISTS upcat_facts_fts_ad',
      'DROP TRIGGER IF EXISTS upcat_facts_fts_au',
      'DROP TRIGGER IF EXISTS career_facts_ai',
      'DROP TRIGGER IF EXISTS career_facts_ad',
      'DROP TRIGGER IF EXISTS career_facts_au',
      'DROP TABLE IF EXISTS flashcards_fts',
      'DROP TABLE IF EXISTS upcat_facts_fts',
      'DROP TABLE IF EXISTS career_facts_fts',
    ]
    for (const sql of FTS_CLEANUP) {
      try { sqlDb.run(sql) } catch (err) { console.warn('[webDb] FTS cleanup skipped:', sql, err) }
    }
  }

  const createResult = runStatementsSafe(sqlDb, createStatements, ftsSupported)

  // Run MIGRATIONS — each entry is a single statement already
  const migrationsResult = runStatementsSafe(sqlDb, MIGRATIONS, ftsSupported)

  webFtsAvailable = ftsSupported && createResult.ftsAvailable && migrationsResult.ftsAvailable

  if (!webFtsAvailable) {
    console.warn('[webDb] FTS5 not available — search will use LIKE fallback')
  }

  // Build drizzle client using the sql.js driver
  const db = drizzle(sqlDb, { schema })

  // ── Persistence ────────────────────────────────────────────────────────────

  async function persistNow(): Promise<void> {
    try {
      const bytes = sqlDb.export()
      await store.save(bytes)
    } catch (err) {
      console.warn('[webDb] persistNow failed:', err)
    }
  }

  let debounceTimer: ReturnType<typeof setTimeout> | null = null
  function schedulePersist(): void {
    if (debounceTimer !== null) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(() => {
      debounceTimer = null
      void persistNow()
    }, 2000)
  }

  // Flush on tab-close / navigation / reload (browser only). visibilitychange
  // covers tab switches and backgrounding; pagehide additionally covers reloads
  // and bfcache eviction, which visibilitychange can miss — without it a hard
  // refresh right after a sync can drop the freshly-synced bytes, forcing a full
  // re-pull (and a flash of empty screens) on the next load.
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        void persistNow()
      }
    })
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('pagehide', () => { void persistNow() })
  }

  return { db, persistNow, schedulePersist }
}
