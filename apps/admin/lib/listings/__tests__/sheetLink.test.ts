import { describe, it, expect } from 'vitest'
import { parseSheetLink } from '../sheetLink'

const ID = 'a'.repeat(30)

describe('parseSheetLink', () => {
  it('parses a standard edit URL with a gid hash', () => {
    expect(parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit#gid=123`)).toEqual({ sheetId: ID, gid: '123' })
  })

  it('parses a URL with gid as a query param', () => {
    expect(parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit?usp=sharing&gid=456`)).toEqual({ sheetId: ID, gid: '456' })
  })

  it('ignores a non-numeric gid (it is spliced into the export URL)', () => {
    expect(parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/edit?gid=1%26format%3Dxlsx`)).toEqual({ sheetId: ID, gid: undefined })
  })

  it('parses a plain /d/<id>/ URL with no gid', () => {
    expect(parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}/`)).toEqual({ sheetId: ID, gid: undefined })
  })

  it('parses a /d/<id> URL with no trailing slash', () => {
    expect(parseSheetLink(`https://docs.google.com/spreadsheets/d/${ID}`)).toEqual({ sheetId: ID, gid: undefined })
  })

  it('accepts a bare sheet id', () => {
    expect(parseSheetLink(ID)).toEqual({ sheetId: ID, gid: undefined })
  })

  it('trims surrounding whitespace', () => {
    expect(parseSheetLink(`  ${ID}  `)).toEqual({ sheetId: ID, gid: undefined })
  })

  it('rejects a non-Google-Docs host (SSRF guard)', () => {
    expect(parseSheetLink(`https://evil.example.com/spreadsheets/d/${ID}/edit`)).toBeNull()
  })

  it('rejects a docs.google.com URL that is not a spreadsheet', () => {
    expect(parseSheetLink('https://docs.google.com/document/d/' + ID + '/edit')).toBeNull()
  })

  it('rejects an id that is too short', () => {
    expect(parseSheetLink('too-short')).toBeNull()
  })

  it('rejects an empty string', () => {
    expect(parseSheetLink('')).toBeNull()
  })

  it('rejects garbage input', () => {
    expect(parseSheetLink('not a url at all, just words')).toBeNull()
  })

  it('rejects a javascript: URL', () => {
    expect(parseSheetLink('javascript:alert(1)')).toBeNull()
  })

  it('accepts a sheet.google.com share-style host variant only when it is docs.google.com', () => {
    // sheets.google.com is not the real host Google uses; only docs.google.com is accepted.
    expect(parseSheetLink(`https://sheets.google.com/spreadsheets/d/${ID}/edit`)).toBeNull()
  })
})
