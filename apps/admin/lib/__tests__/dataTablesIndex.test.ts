import { describe, it, expect } from 'vitest'
import { DATA_TABLE_INDEX, DATA_TABLE_GROUPS } from '../dataTablesIndex'
import { DATA_TABLE_CONFIGS } from '../dataTables'

describe('DATA_TABLE_INDEX', () => {
  it('lists every allow-listed table exactly once', () => {
    expect(DATA_TABLE_INDEX.map(e => e.table).sort()).toEqual(DATA_TABLE_CONFIGS.map(c => c.table).sort())
  })

  it('gives each table a human label, never the snake_case name', () => {
    for (const e of DATA_TABLE_INDEX) {
      expect(e.label).not.toMatch(/_/)
      expect(e.label.length).toBeGreaterThan(2)
    }
  })

  it('links each entry to its browser page', () => {
    for (const e of DATA_TABLE_INDEX) expect(e.href).toBe(`/admin/data/${e.table}`)
  })

  it('files every entry under a known group', () => {
    const groups = DATA_TABLE_GROUPS.map(g => g.value)
    for (const e of DATA_TABLE_INDEX) expect(groups).toContain(e.group)
  })

  it('always has a one-line description', () => {
    for (const e of DATA_TABLE_INDEX) expect(e.description.length).toBeGreaterThan(10)
  })
})
