import { getTableColumns, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core'

/**
 * batchUpsert — chunked multi-row upsert for the launch sync (P1 perf audit).
 *
 * syncOnLaunch used to issue one `INSERT ... ON CONFLICT DO UPDATE` per row
 * (~5,300 statements on a full pull) which janks the JS thread on low-end
 * Android and web wasm. This helper collapses each per-table loop into a few
 * multi-row statements:
 *
 *   INSERT INTO t (a, b, c) VALUES (?,?,?),(?,?,?),...
 *   ON CONFLICT (pk) DO UPDATE SET b = excluded."b", c = excluded."c"
 *
 * `excluded."col"` refers to the conflicting row's incoming value, so each
 * conflicting row is updated with ITS OWN values — byte-identical semantics to
 * the old per-row `set: vals`.
 *
 * Chunking: SQLite's historical bound-parameter limit is 999 (older Android
 * builds; modern builds allow 32k but we target the floor). Drizzle binds a
 * param for every table column per row (missing keys fall back to the column's
 * schema default, which is ALSO bound), so the chunk size is computed from the
 * FULL table column count with a 900 budget:
 *   rowsPerChunk = max(1, floor(900 / columnCount))
 *
 * IMPORTANT — uniform rows: every row in ONE call must have the SAME key set.
 * The update-set is derived from the first row's keys, so a column absent from
 * the rows is left untouched on conflict (this is load-bearing: flashcard rows
 * without ai_* keys must not wipe locally-generated ai_* work). Callers with
 * heterogeneous rows (flashcards) must group rows by key-shape and call once
 * per group.
 */

const PARAM_BUDGET = 900

// Minimal structural view of a drizzle sqlite transaction/database — the same
// insert().values().onConflictDoUpdate().run() chain works on expo-sqlite,
// sql.js (web) and better-sqlite3 (tests) drivers.
export interface BatchUpsertTx {
  insert(table: SQLiteTable): {
    values(rows: Record<string, unknown>[]): {
      onConflictDoUpdate(config: { target: SQLiteColumn | SQLiteColumn[]; set: Record<string, SQL> }): { run(): unknown }
    }
  }
}

export function batchUpsert<TTable extends SQLiteTable>(
  tx: BatchUpsertTx,
  table: TTable,
  rows: TTable['$inferInsert'][],
  conflictTarget: SQLiteColumn | SQLiteColumn[],
): void {
  if (rows.length === 0) return

  const columns = getTableColumns(table)
  const columnCount = Object.keys(columns).length
  const rowsPerChunk = Math.max(1, Math.floor(PARAM_BUDGET / columnCount))

  const targets = Array.isArray(conflictTarget) ? conflictTarget : [conflictTarget]
  const targetDbNames = new Set(targets.map(c => c.name))

  // Map every non-conflict column PRESENT ON THE ROWS to its excluded.* value.
  // Keys are drizzle property names (e.g. topicId); excluded refs use the real
  // DB column name (e.g. excluded."topic_id").
  const set: Record<string, SQL> = {}
  for (const key of Object.keys(rows[0] as Record<string, unknown>)) {
    const col = columns[key]
    if (!col || targetDbNames.has(col.name)) continue
    set[key] = sql.raw(`excluded."${col.name}"`)
  }
  if (Object.keys(set).length === 0) {
    // Rows carry only the conflict-target columns — nothing to update, and
    // `DO UPDATE SET` with an empty set is a syntax error. Nothing sync writes
    // today hits this; guard so the helper can't emit broken SQL.
    throw new Error(`batchUpsert(${table._.name ?? 'table'}): rows contain no updatable columns`)
  }

  for (let i = 0; i < rows.length; i += rowsPerChunk) {
    tx.insert(table)
      .values(rows.slice(i, i + rowsPerChunk) as Record<string, unknown>[])
      .onConflictDoUpdate({ target: conflictTarget, set })
      .run()
  }
}
