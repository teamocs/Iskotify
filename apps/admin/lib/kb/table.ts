// A question file read into one shape, whatever it came as (CSV, a native
// Google Sheet exported as CSV, or an .xlsx workbook's first sheet): the header
// row and one string record per data row.

import Papa from 'papaparse'
import { unzipSync } from 'fflate'
import { readSheet } from 'read-excel-file/node'

export interface Table {
  headers: string[]
  records: Record<string, string>[]
}

export interface TableOptions {
  /** Recognises a header row by its cells (e.g. known column names). The first
   *  of the leading rows it accepts is the header; without a match, the width
   *  rule in tableFromRows decides. */
  isHeader?: (cells: string[]) => boolean
}

/** More than any one question file should hold; also bounds memory per sync. */
export const MAX_TABLE_ROWS = 20_000
// An .xlsx is a zip: cap what it may inflate to, read from its directory
// before anything is decompressed (a few MB can otherwise inflate to GBs).
const MAX_XLSX_UNZIPPED_BYTES = 50 * 1024 * 1024

// Hand-made sheets often put a title (and a blank line) above the header row.
const HEADER_SCAN_ROWS = 10

function cellText(v: unknown): string {
  if (v === null || v === undefined) return ''
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? '' : v.toISOString().slice(0, 10)
  if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE'
  return String(v).trim()
}

const filled = (row: string[]) => row.filter(Boolean).length

export function tableFromRows(raw: readonly (readonly unknown[])[], opts: TableOptions = {}): Table {
  const rows = raw.map(r => r.map(cellText))
  if (rows.length === 0) return { headers: [], records: [] }

  // The header row is the first of the leading rows that is (nearly) as wide as
  // the widest of them — a title row fills one cell, the header fills them all.
  // A caller that knows its columns can recognise the header outright, which
  // also catches a banner merged across a few cells.
  const scan = rows.slice(0, HEADER_SCAN_ROWS)
  const widest = Math.max(...scan.map(filled))
  const hinted = opts.isHeader ? scan.findIndex(r => opts.isHeader!(r)) : -1
  const headerAt = hinted >= 0
    ? hinted
    : Math.max(0, scan.findIndex(r => filled(r) >= Math.max(1, Math.ceil(widest * 0.6))))
  const headerRow = rows[headerAt]!
  const body = rows.slice(headerAt + 1)

  let width = Math.max(headerRow.length, ...body.map(r => r.length))
  // Trailing unnamed, empty columns are noise from the sheet's used range.
  while (width > 0 && !headerRow[width - 1] && body.every(r => !r[width - 1])) width--

  const seen = new Map<string, number>()
  const headers: string[] = []
  for (let i = 0; i < width; i++) {
    const base = headerRow[i] || `Column ${i + 1}`
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    headers.push(n === 1 ? base : `${base} (${n})`)
  }

  const dataRows = body.filter(r => filled(r) > 0)
  if (dataRows.length > MAX_TABLE_ROWS) {
    throw new Error(`File has ${dataRows.length} rows; split it into files of at most ${MAX_TABLE_ROWS}.`)
  }
  const records = dataRows
    .map(r => Object.fromEntries(headers.map((h, i) => [h, r[i] ?? ''])))
  return { headers, records }
}

export function tableFromCsv(text: string, opts?: TableOptions): Table {
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ''), { skipEmptyLines: 'greedy' })
  return tableFromRows(parsed.data, opts)
}

export async function tableFromXlsx(bytes: Buffer, opts?: TableOptions): Promise<Table> {
  let unzipped = 0
  // The filter sees each entry's declared size and returning false skips
  // inflating it, so this reads only the zip directory.
  unzipSync(bytes, {
    filter: f => {
      unzipped += f.originalSize
      if (unzipped > MAX_XLSX_UNZIPPED_BYTES) throw new Error('Workbook is too large once unzipped — split it into smaller files.')
      return false
    },
  })
  return tableFromRows(await readSheet(bytes), opts)
}
