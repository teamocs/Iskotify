// Builds a minimal, valid .xlsx workbook (one sheet, shared strings) in memory,
// so tests exercise the real xlsx reader without binary fixture files.
import { zipSync, strToU8 } from 'fflate'

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
const xml = (s: string) => strToU8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>${s}`)
const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const PKG_REL = 'http://schemas.openxmlformats.org/package/2006/relationships'

function colName(i: number): string {
  let s = ''
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s
  return s
}

export function makeXlsx(rows: (string | number)[][]): Buffer {
  const strings: string[] = []
  const index = new Map<string, number>()
  const sheetRows = rows.map((row, r) => {
    const cells = row.map((v, c) => {
      const ref = `${colName(c)}${r + 1}`
      if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`
      if (!index.has(v)) { index.set(v, strings.length); strings.push(v) }
      return `<c r="${ref}" t="s"><v>${index.get(v)}</v></c>`
    })
    return `<row r="${r + 1}">${cells.join('')}</row>`
  })
  return Buffer.from(zipSync({
    '[Content_Types].xml': xml('<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>'),
    '_rels/.rels': xml(`<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL_NS}/officeDocument" Target="xl/workbook.xml"/></Relationships>`),
    'xl/workbook.xml': xml(`<workbook ${NS} xmlns:r="${REL_NS}"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`),
    'xl/_rels/workbook.xml.rels': xml(`<Relationships xmlns="${PKG_REL}"><Relationship Id="rId1" Type="${REL_NS}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL_NS}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`),
    'xl/sharedStrings.xml': xml(`<sst ${NS} count="${strings.length}" uniqueCount="${strings.length}">${strings.map(s => `<si><t xml:space="preserve">${esc(s)}</t></si>`).join('')}</sst>`),
    'xl/worksheets/sheet1.xml': xml(`<worksheet ${NS}><sheetData>${sheetRows.join('')}</sheetData></worksheet>`),
  }))
}
