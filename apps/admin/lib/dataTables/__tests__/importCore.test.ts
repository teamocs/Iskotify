import { describe, it, expect } from 'vitest'
import { importDataTable, type SupabaseLike } from '../importCore'
import type { DataTableConfig } from '../../dataTables'

const TEXT_CONFIG: DataTableConfig = {
  table: 't',
  label: 'T',
  idColumn: 'code',
  idType: 'text',
  searchColumns: ['code'],
  columns: [
    { name: 'code', label: 'Code', type: 'text', required: true },
    { name: 'name', label: 'Name', type: 'text' },
    { name: 'tags', label: 'Tags', type: 'json' },
    { name: 'active', label: 'Active', type: 'boolean' },
    { name: 'score', label: 'Score', type: 'number' },
  ],
}

const UUID_CONFIG: DataTableConfig = {
  table: 'u',
  label: 'U',
  idColumn: 'id',
  idType: 'uuid',
  searchColumns: ['id'],
  columns: [
    { name: 'id', label: 'ID', type: 'text' },
    { name: 'name', label: 'Name', type: 'text' },
  ],
}

// Mock Supabase: fetchExistingIds reads .select(id).order(id).range(); upsert records chunks.
function makeSupabase(idCol: string, existingIds: string[] = [], upsertError: unknown = null) {
  const upsertCalls: Record<string, unknown>[][] = []
  const supabase: SupabaseLike = {
    from() {
      return {
        select() {
          return {
            order() {
              return {
                range(from: number) {
                  if (from === 0) {
                    return Promise.resolve({ data: existingIds.map(id => ({ [idCol]: id })), error: null })
                  }
                  return Promise.resolve({ data: [], error: null })
                },
              }
            },
          }
        },
        upsert(chunk: Record<string, unknown>[]) {
          upsertCalls.push(chunk)
          return Promise.resolve({ error: upsertError })
        },
      }
    },
  }
  return { supabase, upsertCalls }
}

describe('importDataTable', () => {
  it('inserts new rows and coerces cell types', async () => {
    const { supabase, upsertCalls } = makeSupabase('code', [])
    const res = await importDataTable(supabase, TEXT_CONFIG, [
      { code: 'a', name: 'Alpha', tags: '["x","y"]', active: 'true' },
      { code: 'b', name: 'Beta', tags: 'p;q', active: 'false' },
    ])
    expect(res.inserted).toBe(2)
    expect(res.updated).toBe(0)
    expect(res.errors).toEqual([])
    const chunk = upsertCalls[0]!
    expect(chunk[0]!.tags).toEqual(['x', 'y'])
    expect(chunk[1]!.tags).toEqual(['p', 'q']) // semicolon fallback
    expect(chunk[0]!.active).toBe(true)
    expect(chunk[1]!.active).toBe(false)
    expect(typeof chunk[0]!.updated_at).toBe('string')
  })

  it('counts updates against existing ids', async () => {
    const { supabase } = makeSupabase('code', ['a'])
    const res = await importDataTable(supabase, TEXT_CONFIG, [
      { code: 'a', name: 'A' },
      { code: 'c', name: 'C' },
    ])
    expect(res.updated).toBe(1)
    expect(res.inserted).toBe(1)
  })

  it('errors (and skips) a text-PK row with a missing id', async () => {
    const { supabase, upsertCalls } = makeSupabase('code', [])
    const res = await importDataTable(supabase, TEXT_CONFIG, [
      { code: '', name: 'NoId' },
      { code: 'ok', name: 'OK' },
    ])
    expect(res.errors).toHaveLength(1)
    expect(res.errors[0]!.message).toContain('code')
    expect(res.inserted).toBe(1)
    expect(upsertCalls[0]).toHaveLength(1)
  })

  it('generates a UUID for uuid-PK rows with no id', async () => {
    const { supabase, upsertCalls } = makeSupabase('id', [])
    const res = await importDataTable(supabase, UUID_CONFIG, [{ name: 'NoId' }])
    expect(res.errors).toEqual([])
    expect(res.inserted).toBe(1)
    expect(typeof upsertCalls[0]![0]!.id).toBe('string')
    expect(String(upsertCalls[0]![0]!.id)).toHaveLength(36)
  })

  it('passes native JSON arrays through untouched', async () => {
    const { supabase, upsertCalls } = makeSupabase('code', [])
    await importDataTable(supabase, TEXT_CONFIG, [{ code: 'a', tags: ['n1', 'n2'] }])
    expect(upsertCalls[0]![0]!.tags).toEqual(['n1', 'n2'])
  })

  it('records a row error for an unparseable number cell', async () => {
    const { supabase } = makeSupabase('code', [])
    const res = await importDataTable(supabase, TEXT_CONFIG, [{ code: 'a', score: 'abc' }])
    expect(res.errors).toHaveLength(1)
    expect(res.inserted).toBe(0)
  })

  it('chunks upserts above 500 rows', async () => {
    const rows = Array.from({ length: 600 }, (_, i) => ({ code: `c${i}`, name: `N${i}` }))
    const { supabase, upsertCalls } = makeSupabase('code', [])
    const res = await importDataTable(supabase, TEXT_CONFIG, rows)
    expect(res.inserted).toBe(600)
    expect(upsertCalls).toHaveLength(2)
    expect(upsertCalls[0]).toHaveLength(500)
    expect(upsertCalls[1]).toHaveLength(100)
  })

  it('dedupes duplicate ids (last wins)', async () => {
    const { supabase, upsertCalls } = makeSupabase('code', [])
    const res = await importDataTable(supabase, TEXT_CONFIG, [
      { code: 'a', name: 'First' },
      { code: 'a', name: 'Second' },
    ])
    expect(res.total).toBe(2)
    expect(upsertCalls[0]).toHaveLength(1)
    expect(upsertCalls[0]![0]!.name).toBe('Second')
    expect(res.inserted).toBe(1)
  })

  it('surfaces an upsert failure in errors', async () => {
    const { supabase } = makeSupabase('code', [], { message: 'boom' })
    const res = await importDataTable(supabase, TEXT_CONFIG, [{ code: 'a' }])
    expect(res.errors.some(e => e.message.includes('boom'))).toBe(true)
  })
})
