import { describe, it, expect } from 'vitest'
import { encodeCsvCell, decodeCsvCell, buildExportCsv, exportColumnNames, parseCsv } from '../serialization'
import type { DataTableConfig } from '../../dataTables'

const CONFIG: DataTableConfig = {
  table: 'sample',
  label: 'Sample',
  idColumn: 'id',
  idType: 'text',
  searchColumns: ['id'],
  columns: [
    { name: 'id', label: 'ID', type: 'text', required: true },
    { name: 'name', label: 'Name', type: 'text' },
    { name: 'count', label: 'Count', type: 'number' },
    { name: 'active', label: 'Active', type: 'boolean' },
    { name: 'tags', label: 'Tags', type: 'json' },
  ],
}

describe('encodeCsvCell', () => {
  it('encodes nulls as empty', () => {
    expect(encodeCsvCell(null, 'text')).toBe('')
    expect(encodeCsvCell(undefined, 'number')).toBe('')
  })
  it('encodes booleans/numbers/text', () => {
    expect(encodeCsvCell(true, 'boolean')).toBe('true')
    expect(encodeCsvCell(false, 'boolean')).toBe('false')
    expect(encodeCsvCell(42, 'number')).toBe('42')
    expect(encodeCsvCell('hi', 'text')).toBe('hi')
  })
  it('encodes array/jsonb columns as JSON text', () => {
    expect(encodeCsvCell(['a', 'b'], 'json')).toBe('["a","b"]')
    expect(encodeCsvCell({ k: 1 }, 'json')).toBe('{"k":1}')
  })
})

describe('decodeCsvCell', () => {
  it('coerces booleans (blank = false)', () => {
    expect(decodeCsvCell('true', 'boolean')).toBe(true)
    expect(decodeCsvCell('1', 'boolean')).toBe(true)
    expect(decodeCsvCell('yes', 'boolean')).toBe(true)
    expect(decodeCsvCell('false', 'boolean')).toBe(false)
    expect(decodeCsvCell('', 'boolean')).toBe(false)
  })
  it('coerces numbers and throws on non-numeric', () => {
    expect(decodeCsvCell('5', 'number')).toBe(5)
    expect(decodeCsvCell('', 'number')).toBeNull()
    expect(() => decodeCsvCell('abc', 'number')).toThrow()
  })
  it('parses JSON array cells, with semicolon fallback', () => {
    expect(decodeCsvCell('["a","b"]', 'json')).toEqual(['a', 'b'])
    expect(decodeCsvCell('a;b;c', 'json')).toEqual(['a', 'b', 'c'])
    expect(decodeCsvCell('', 'json')).toBeNull()
  })
  it('passes native (non-string) JSON values through', () => {
    expect(decodeCsvCell(['x'], 'json')).toEqual(['x'])
    expect(decodeCsvCell({ a: 1 }, 'json')).toEqual({ a: 1 })
  })
  it('passes text through', () => {
    expect(decodeCsvCell('hello', 'text')).toBe('hello')
  })
})

describe('exportColumnNames', () => {
  it('keeps configured order when id is present', () => {
    expect(exportColumnNames(CONFIG)).toEqual(['id', 'name', 'count', 'active', 'tags'])
  })
  it('prepends id when not listed', () => {
    const c = { ...CONFIG, columns: CONFIG.columns.filter(col => col.name !== 'id') }
    expect(exportColumnNames(c)[0]).toBe('id')
  })
})

describe('buildExportCsv → parseCsv round-trip', () => {
  it('round-trips rows (incl. commas, quotes, arrays)', () => {
    const rows = [
      { id: 'a1', name: 'Has, comma "and" quote', count: 3, active: true, tags: ['x', 'y'] },
      { id: 'a2', name: null, count: null, active: false, tags: [] },
    ]
    const csv = buildExportCsv(rows, CONFIG)
    expect(csv.charCodeAt(0)).toBe(0xFEFF) // BOM
    const parsed = parseCsv(csv)
    expect(parsed).toHaveLength(2)
    expect(parsed[0]!.name).toBe('Has, comma "and" quote')
    // re-decode the array cell
    expect(decodeCsvCell(parsed[0]!.tags, 'json')).toEqual(['x', 'y'])
    expect(decodeCsvCell(parsed[1]!.active, 'boolean')).toBe(false)
  })
})
