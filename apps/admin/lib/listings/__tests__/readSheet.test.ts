import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockValuesGet = vi.fn()
const mockSpreadsheetsGet = vi.fn()

vi.mock('googleapis', () => ({
  google: {
    auth: { GoogleAuth: vi.fn().mockImplementation(() => ({})) },
    sheets: vi.fn(() => ({
      spreadsheets: {
        get: mockSpreadsheetsGet,
        values: { get: mockValuesGet },
      },
    })),
  },
}))

const mockFetch = vi.fn()
vi.stubGlobal('fetch', mockFetch)

async function load() {
  return import('../readSheet')
}

const SERVICE_ACCOUNT_JSON = JSON.stringify({
  type: 'service_account',
  client_email: 'sync-bot@fake-project.iam.gserviceaccount.com',
})

describe('readSheet', () => {
  beforeEach(() => {
    vi.resetModules()
    mockValuesGet.mockReset()
    mockSpreadsheetsGet.mockReset()
    mockFetch.mockReset()
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', SERVICE_ACCOUNT_JSON)
  })

  it('reads via the Sheets API when the service account has access', async () => {
    mockSpreadsheetsGet.mockResolvedValue({
      data: {
        properties: { title: 'Scholarships 2026' },
        sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }, { properties: { sheetId: 999, title: 'Archive' } }],
      },
    })
    mockValuesGet.mockResolvedValue({
      data: { values: [['title', 'type'], ['DOST', 'scholarship']] },
    })
    const { readSheet } = await load()
    const result = await readSheet({ sheetId: 'sheet-id-123' })
    expect(result.title).toBe('Scholarships 2026')
    expect(result.tab).toBe('Sheet1')
    expect(result.headers).toEqual(['title', 'type'])
    expect(result.records).toEqual([{ title: 'DOST', type: 'scholarship' }])
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('picks the tab whose sheetId matches the gid', async () => {
    mockSpreadsheetsGet.mockResolvedValue({
      data: {
        properties: { title: 'Scholarships 2026' },
        sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }, { properties: { sheetId: 999, title: 'Archive' } }],
      },
    })
    mockValuesGet.mockResolvedValue({ data: { values: [['title'], ['a']] } })
    const { readSheet } = await load()
    const result = await readSheet({ sheetId: 'sheet-id-123', gid: '999' })
    expect(result.tab).toBe('Archive')
    expect(mockValuesGet).toHaveBeenCalledWith(expect.objectContaining({ range: 'Archive' }))
  })

  it('falls back to the public CSV export when the API returns 403', async () => {
    mockSpreadsheetsGet.mockRejectedValue(Object.assign(new Error('The caller does not have permission'), { code: 403 }))
    mockFetch.mockResolvedValue({
      ok: true,
      text: async () => 'title,type\nDOST,scholarship\n',
    })
    const { readSheet } = await load()
    const result = await readSheet({ sheetId: 'sheet-id-123' })
    expect(result.headers).toEqual(['title', 'type'])
    expect(result.records).toEqual([{ title: 'DOST', type: 'scholarship' }])
    expect(mockFetch).toHaveBeenCalledWith(
      'https://docs.google.com/spreadsheets/d/sheet-id-123/export?format=csv&gid=0',
      expect.objectContaining({ redirect: 'follow' }),
    )
  })

  it('falls back to CSV export with the requested gid', async () => {
    mockSpreadsheetsGet.mockRejectedValue(Object.assign(new Error('not found'), { code: 404 }))
    mockFetch.mockResolvedValue({ ok: true, text: async () => 'title\na\n' })
    const { readSheet } = await load()
    await readSheet({ sheetId: 'sheet-id-123', gid: '42' })
    expect(mockFetch).toHaveBeenCalledWith(
      'https://docs.google.com/spreadsheets/d/sheet-id-123/export?format=csv&gid=42',
      expect.anything(),
    )
  })

  it('throws a share-instructions error naming the service account when both the API and CSV fallback fail', async () => {
    mockSpreadsheetsGet.mockRejectedValue(Object.assign(new Error('forbidden'), { code: 403 }))
    mockFetch.mockResolvedValue({ ok: false, status: 404 })
    const { readSheet } = await load()
    await expect(readSheet({ sheetId: 'sheet-id-123' })).rejects.toThrow(
      /Share the sheet with sync-bot@fake-project\.iam\.gserviceaccount\.com \(Viewer\), or set General access to.*Anyone with the link/,
    )
  })

  it('skips a merged title banner above the header row (API path)', async () => {
    mockSpreadsheetsGet.mockResolvedValue({
      data: { properties: { title: 'Scholarships 2026' }, sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }] },
    })
    mockValuesGet.mockResolvedValue({
      data: { values: [['DOST Scholarships 2026', '2026'], ['title', 'type'], ['DOST', 'scholarship']] },
    })
    const { readSheet } = await load()
    const result = await readSheet({ sheetId: 'sheet-id-123' })
    expect(result.headers).toEqual(['title', 'type'])
    expect(result.records).toEqual([{ title: 'DOST', type: 'scholarship' }])
  })

  it('skips a merged title banner above the header row (CSV fallback)', async () => {
    mockSpreadsheetsGet.mockRejectedValue(Object.assign(new Error('forbidden'), { code: 403 }))
    mockFetch.mockResolvedValue({ ok: true, text: async () => 'Scholarships banner,,\ntitle,type,provider\nDOST,scholarship,DOST\n' })
    const { readSheet } = await load()
    const result = await readSheet({ sheetId: 'sheet-id-123' })
    expect(result.headers).toEqual(['title', 'type', 'provider'])
    expect(result.records).toEqual([{ title: 'DOST', type: 'scholarship', provider: 'DOST' }])
  })

  it('caps rows at 5000', async () => {
    mockSpreadsheetsGet.mockResolvedValue({
      data: { properties: { title: 'Big' }, sheets: [{ properties: { sheetId: 0, title: 'Sheet1' } }] },
    })
    const header = ['title']
    const rows = Array.from({ length: 6000 }, (_, i) => [`row-${i}`])
    mockValuesGet.mockResolvedValue({ data: { values: [header, ...rows] } })
    const { readSheet } = await load()
    const result = await readSheet({ sheetId: 'sheet-id-123' })
    expect(result.records).toHaveLength(5000)
  })

  it('rejects a request that takes too long against the CSV fallback', async () => {
    mockSpreadsheetsGet.mockRejectedValue(Object.assign(new Error('forbidden'), { code: 403 }))
    mockFetch.mockImplementation((_url: string, init: RequestInit) => {
      expect(init.signal).toBeDefined()
      return Promise.resolve({ ok: true, text: async () => 'title\na\n' })
    })
    const { readSheet } = await load()
    await readSheet({ sheetId: 'sheet-id-123' })
    expect(mockFetch).toHaveBeenCalled()
  })
})
