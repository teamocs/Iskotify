import { describe, it, expect } from 'vitest'
import { zipSync, strToU8 } from 'fflate'
import { tableFromCsv, tableFromRows, tableFromXlsx, MAX_TABLE_ROWS } from '../table'

describe('tableFromRows', () => {
  it('uses the first row as headers and keys records by them', () => {
    const t = tableFromRows([['ID', 'Question', 'Answer'], ['1', 'Q?', 'B']])
    expect(t.headers).toEqual(['ID', 'Question', 'Answer'])
    expect(t.records).toEqual([{ ID: '1', Question: 'Q?', Answer: 'B' }])
  })

  it('skips a title row above the real header row', () => {
    const t = tableFromRows([
      ['ACET General Knowledge — 300 Questions', null, null, null],
      [null, null, null, null],
      ['No.', 'Question', 'A', 'B'],
      [1, 'Capital of PH?', 'Manila', 'Cebu'],
    ])
    expect(t.headers).toEqual(['No.', 'Question', 'A', 'B'])
    expect(t.records).toEqual([{ 'No.': '1', Question: 'Capital of PH?', A: 'Manila', B: 'Cebu' }])
  })

  it('turns numbers, booleans and dates into strings and drops blank rows', () => {
    const t = tableFromRows([
      ['n', 'flag', 'when'],
      [2.5, true, new Date('2026-09-01T00:00:00Z')],
      [null, '', '  '],
    ])
    expect(t.records).toEqual([{ n: '2.5', flag: 'TRUE', when: '2026-09-01' }])
  })

  it('names blank and repeated headers so no column is lost', () => {
    const t = tableFromRows([['Q', '', 'Q'], ['a', 'b', 'c']])
    expect(t.headers).toEqual(['Q', 'Column 2', 'Q (2)'])
    expect(t.records[0]).toEqual({ Q: 'a', 'Column 2': 'b', 'Q (2)': 'c' })
  })

  it('returns an empty table for no data', () => {
    expect(tableFromRows([])).toEqual({ headers: [], records: [] })
  })
})

describe('tableFromCsv', () => {
  it('parses CSV (with a BOM and quoted commas)', () => {
    const t = tableFromCsv('﻿ID,Question\n1,"Hi, there?"\n')
    expect(t.headers).toEqual(['ID', 'Question'])
    expect(t.records).toEqual([{ ID: '1', Question: 'Hi, there?' }])
  })
})

describe('tableFromXlsx', () => {
  it('reads the first worksheet of an .xlsx file', async () => {
    const xml = (s: string) => strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`)
    const ns = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
    const rel = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"'
    const bytes = zipSync({
      '[Content_Types].xml': xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>'),
      '_rels/.rels': xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
      'xl/workbook.xml': xml(`<workbook ${ns} ${rel}><sheets><sheet name="Questions" sheetId="1" r:id="rId1"/></sheets></workbook>`),
      'xl/_rels/workbook.xml.rels': xml('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'),
      'xl/sharedStrings.xml': xml(`<sst ${ns} count="3" uniqueCount="3"><si><t>ID</t></si><si><t>Question</t></si><si><t>What is 2+2?</t></si></sst>`),
      'xl/worksheets/sheet1.xml': xml(`<worksheet ${ns}><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>7</v></c><c r="B2" t="s"><v>2</v></c></row></sheetData></worksheet>`),
    })
    const t = await tableFromXlsx(Buffer.from(bytes))
    expect(t.headers).toEqual(['ID', 'Question'])
    expect(t.records).toEqual([{ ID: '7', Question: 'What is 2+2?' }])
  })
})

describe('table size guards', () => {
  it('refuses a workbook that would inflate past the limit, without inflating it', async () => {
    // Highly compressible: a few KB zipped, ~60 MB unzipped.
    const huge = zipSync({ 'xl/worksheets/sheet1.xml': new Uint8Array(60 * 1024 * 1024) }, { level: 9 })
    expect(huge.length).toBeLessThan(1024 * 1024)
    await expect(tableFromXlsx(Buffer.from(huge))).rejects.toThrow(/too large/i)
  })

  it('refuses more rows than one file should hold', () => {
    const rows = [['Q'], ...Array.from({ length: MAX_TABLE_ROWS + 1 }, (_, i) => [`q${i}`])]
    expect(() => tableFromRows(rows)).toThrow(/rows/i)
  })
})

describe('tableFromRows with a header hint', () => {
  it('prefers the first row the hint recognises over a wide banner row', () => {
    // A merged two-cell banner ("title | year") is as wide as a short header,
    // so the width rule alone would take it.
    const t = tableFromRows(
      [
        ['DOST Scholarships', '2026'],
        ['Title', 'Type'],
        ['DOST-SEI', 'scholarship'],
      ],
      { isHeader: cells => cells.includes('Title') },
    )
    expect(t.headers).toEqual(['Title', 'Type'])
    expect(t.records).toEqual([{ Title: 'DOST-SEI', Type: 'scholarship' }])
  })

  it('falls back to the width rule when no scanned row matches the hint', () => {
    const t = tableFromRows([['Banner', null], ['a', 'b'], ['1', '2']], { isHeader: () => false })
    expect(t.headers).toEqual(['a', 'b'])
  })

  it('passes the hint through the CSV reader', () => {
    const t = tableFromCsv('DOST Scholarships,2026\nTitle,Type\nDOST-SEI,scholarship\n', { isHeader: cells => cells.includes('Title') })
    expect(t.headers).toEqual(['Title', 'Type'])
  })
})
