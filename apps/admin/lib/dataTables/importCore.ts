// Pure import logic for the generic Data Manager. Validates + coerces raw rows
// (from CSV or JSON) per the table config and upserts them in chunks on the id
// column. Returns inserted/updated counts + per-row errors. Kept free of Next/HTTP
// so it is unit-testable with a mocked Supabase client.

import { randomUUID } from 'node:crypto'
import type { DataTableConfig } from '../dataTables'
import { decodeCsvCell } from './serialization'
import { cleanImportedText } from '../csv/cleaners'

export interface ImportRowError { row: number; id?: string; message: string }
export interface ImportResult {
  total: number
  inserted: number
  updated: number
  errors: ImportRowError[]
}

// Minimal structural shape — the real service client and test mocks both satisfy it.
export interface SupabaseLike {
  from(table: string): any // eslint-disable-line @typescript-eslint/no-explicit-any
}

const CHUNK = 500

async function fetchExistingIds(supabase: SupabaseLike, config: DataTableConfig): Promise<Set<string>> {
  const ids = new Set<string>()
  let from = 0
  for (;;) {
    const { data, error } = await supabase
      .from(config.table)
      .select(config.idColumn)
      .order(config.idColumn)
      .range(from, from + 999)
    if (error || !data || data.length === 0) break
    for (const r of data) ids.add(String(r[config.idColumn]))
    if (data.length < 1000) break
    from += 1000
  }
  return ids
}

export async function importDataTable(
  supabase: SupabaseLike,
  config: DataTableConfig,
  rawRows: Record<string, unknown>[],
): Promise<ImportResult> {
  const errors: ImportRowError[] = []
  const typeByName = new Map(config.columns.map(c => [c.name, c.type]))
  const colNames = config.columns.map(c => c.name)
  const idCol = config.idColumn
  const now = new Date().toISOString()

  const payloads: Record<string, unknown>[] = []

  rawRows.forEach((raw, i) => {
    const rowNum = i + 1
    try {
      const payload: Record<string, unknown> = {}
      for (const name of colNames) {
        if (!(name in raw)) continue
        const type = typeByName.get(name)!
        let val = decodeCsvCell(raw[name], type)
        if ((type === 'text' || type === 'textarea') && typeof val === 'string') {
          const cleaned = cleanImportedText(val)
          val = cleaned === '' ? null : cleaned
        }
        payload[name] = val
      }

      let id = payload[idCol]
      if (id == null || id === '') {
        if (config.idType === 'uuid') {
          id = randomUUID()
          payload[idCol] = id
        } else {
          errors.push({ row: rowNum, message: `${idCol} is required` })
          return
        }
      }
      payload['updated_at'] = now
      payloads.push(payload)
    } catch (e) {
      errors.push({ row: rowNum, message: e instanceof Error ? e.message : String(e) })
    }
  })

  if (payloads.length === 0) {
    return { total: rawRows.length, inserted: 0, updated: 0, errors }
  }

  // Dedupe by id (last wins) — a single upsert can't carry two rows with the same
  // conflict key (Postgres error 21000).
  const byId = new Map<string, Record<string, unknown>>()
  for (const p of payloads) byId.set(String(p[idCol]), p)
  const deduped = [...byId.values()]

  const existing = await fetchExistingIds(supabase, config)
  let updated = 0
  for (const p of deduped) if (existing.has(String(p[idCol]))) updated++
  const inserted = deduped.length - updated

  for (let i = 0; i < deduped.length; i += CHUNK) {
    const chunk = deduped.slice(i, i + CHUNK)
    const { error } = await supabase.from(config.table).upsert(chunk, { onConflict: idCol })
    if (error) {
      errors.push({ row: 0, message: `Upsert failed (chunk ${Math.floor(i / CHUNK) + 1}): ${error.message ?? String(error)}` })
    }
  }

  // If chunks failed, the counts are best-effort; errors[] surfaces the failure.
  return { total: rawRows.length, inserted, updated, errors }
}
