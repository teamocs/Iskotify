// Shared CSV/JSON (de)serialization for the generic Data Manager import/export.
// Pure + unit-tested. CSV uses papaparse (already a dep). Array/jsonb columns
// (config type 'json') are encoded as JSON text inside a single cell; on import a
// cell that isn't valid JSON falls back to a semicolon-split array.

import Papa from 'papaparse'
import type { DataTableColumnConfig, DataTableConfig } from '../dataTables'

type ColType = DataTableColumnConfig['type']

/** Column order for export/import: the configured columns, with the id column
 *  guaranteed present (prepended if it wasn't listed). Excludes updated_at. */
export function exportColumnNames(config: DataTableConfig): string[] {
  const names = config.columns.map(c => c.name)
  return names.includes(config.idColumn) ? names : [config.idColumn, ...names]
}

/** Encode one row value to a CSV cell string. */
export function encodeCsvCell(value: unknown, type: ColType): string {
  if (value === null || value === undefined) return ''
  if (type === 'boolean') return value ? 'true' : 'false'
  if (type === 'number') return String(value)
  if (type === 'json') {
    try { return JSON.stringify(value) } catch { return '' }
  }
  return String(value)
}

/** Decode a raw cell (string from CSV, or native value from JSON import) to the
 *  typed value. Throws on a non-numeric number cell (caught per-row by the importer). */
export function decodeCsvCell(raw: unknown, type: ColType): unknown {
  if (raw === null || raw === undefined) return type === 'boolean' ? false : null

  if (type === 'boolean') {
    if (typeof raw === 'boolean') return raw
    const s = String(raw).trim().toLowerCase()
    if (s === '') return false
    return s === 'true' || s === '1' || s === 'yes' || s === 'y'
  }

  if (type === 'number') {
    if (typeof raw === 'number') return raw
    const s = String(raw).trim()
    if (s === '') return null
    const n = Number(s)
    if (Number.isNaN(n)) throw new Error(`"${s}" is not a number`)
    return n
  }

  if (type === 'json') {
    if (typeof raw !== 'string') return raw // already array/object (JSON import)
    const s = raw.trim()
    if (s === '') return null
    try { return JSON.parse(s) } catch { /* fall through to semicolon split */ }
    return s.split(';').map(x => x.trim()).filter(Boolean)
  }

  // text / textarea
  return typeof raw === 'string' ? raw : String(raw)
}

/** Build a downloadable CSV string for the given rows (UTF-8 BOM so Excel renders
 *  ñ / – / ₱; the importer strips the BOM via stripBom). */
export function buildExportCsv(rows: Record<string, unknown>[], config: DataTableConfig): string {
  const fields = exportColumnNames(config)
  const typeByName = new Map<string, ColType>(config.columns.map(c => [c.name, c.type]))
  const data = rows.map(row => fields.map(f => encodeCsvCell(row[f], typeByName.get(f) ?? 'text')))
  const BOM = String.fromCharCode(0xFEFF)
  return BOM + Papa.unparse({ fields, data }, { header: true })
}

/** Parse an uploaded CSV string into row objects keyed by header. */
export function parseCsv(text: string): Record<string, string>[] {
  const res = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true })
  return (res.data ?? []).filter(r => r && typeof r === 'object')
}
