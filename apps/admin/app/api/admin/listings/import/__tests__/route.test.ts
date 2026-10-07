import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const mockRequireAdmin = vi.fn()
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => mockRequireAdmin() }))

const mockParseSheetLink = vi.fn()
vi.mock('@/lib/listings/sheetLink', () => ({ parseSheetLink: (...a: unknown[]) => mockParseSheetLink(...a) }))

const mockReadSheet = vi.fn()
vi.mock('@/lib/listings/readSheet', () => ({ readSheet: (...a: unknown[]) => mockReadSheet(...a) }))

const mockPlanImport = vi.fn()
vi.mock('@/lib/listings/planImport', () => ({ planImport: (...a: unknown[]) => mockPlanImport(...a) }))

// A generic thenable query-builder stub: every chain method returns itself,
// so any call order the route uses resolves to the same configured result —
// exactly like the real supabase-js builder, which is thenable at any point.
function makeChain(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    in: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    update: vi.fn(() => chain),
    insert: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    single: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  }
  return chain
}

let tableResults: Record<string, ReturnType<typeof makeChain>>
const mockFrom = vi.fn((table: string) => tableResults[table])

vi.mock('@iskotify/utils', async () => {
  const actual = await vi.importActual<typeof import('@iskotify/utils')>('@iskotify/utils')
  return { ...actual, createServerClient: () => ({ from: mockFrom }) }
})

function req(body: unknown) {
  return { json: async () => body } as unknown as import('next/server').NextRequest
}

async function loadRoute() {
  return import('../route')
}

const SHEET = { title: 'Scholarships', tab: 'Sheet1', headers: ['title'], records: [{ title: 'A' }] }
const PLAN = {
  rows: [{ slug: 'a', title: 'A', action: 'new', changes: [], listing: { slug: 'a' } }],
  invalid: [],
  missing: [],
  columnMap: { title: 'title' },
  mappedByAi: false,
  counts: { new: 1, update: 0, unchanged: 0, invalid: 0 },
}

describe('POST /api/admin/listings/import', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRequireAdmin.mockReset()
    mockParseSheetLink.mockReset()
    mockReadSheet.mockReset()
    mockPlanImport.mockReset()
    mockFrom.mockClear()

    mockRequireAdmin.mockResolvedValue({ supabase: {}, userId: 'admin-1' })
    mockParseSheetLink.mockReturnValue({ sheetId: 'sheet-123', gid: undefined })
    mockReadSheet.mockResolvedValue(SHEET)
    mockPlanImport.mockResolvedValue(PLAN)

    tableResults = {
      listings: makeChain({ data: [{ slug: 'existing' }], error: null }),
      listing_import_batches: makeChain({ data: { id: 'batch-1', status: 'preview' }, error: null }),
    }
  })

  it('is admin-only', async () => {
    mockRequireAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    const { POST } = await loadRoute()
    const res = await POST(req({ url: 'https://docs.google.com/spreadsheets/d/x/edit' }))
    expect(res.status).toBe(403)
    expect(mockParseSheetLink).not.toHaveBeenCalled()
  })

  it('rejects a missing or invalid link with 400', async () => {
    mockParseSheetLink.mockReturnValue(null)
    const { POST } = await loadRoute()
    const res = await POST(req({ url: 'not a link' }))
    expect(res.status).toBe(400)
    expect(mockReadSheet).not.toHaveBeenCalled()
  })

  it('rejects a request with no url at all', async () => {
    const { POST } = await loadRoute()
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('returns 502 when the sheet cannot be read', async () => {
    mockReadSheet.mockRejectedValue(new Error('Share the sheet with sync-bot@x.iam.gserviceaccount.com (Viewer)'))
    const { POST } = await loadRoute()
    const res = await POST(req({ url: 'https://docs.google.com/spreadsheets/d/x/edit' }))
    expect(res.status).toBe(502)
    const body = await res.json()
    expect(body.error).toMatch(/Share the sheet/)
  })

  it('plans the import and inserts a new preview batch', async () => {
    const { POST } = await loadRoute()
    const res = await POST(req({ url: 'https://docs.google.com/spreadsheets/d/sheet-123/edit' }))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ id: 'batch-1', status: 'preview' })

    expect(mockPlanImport).toHaveBeenCalledWith(
      { headers: SHEET.headers, records: SHEET.records },
      [{ slug: 'existing' }],
    )
    expect(tableResults.listing_import_batches!.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'discarded' }),
    )
    expect(tableResults.listing_import_batches!.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        sheet_id: 'sheet-123',
        status: 'preview',
        rows: PLAN.rows,
        invalid: PLAN.invalid,
        missing: PLAN.missing,
        new_count: 1,
        created_by: 'admin-1',
      }),
    )
  })

  it('discards any existing live preview before inserting the new one', async () => {
    const { POST } = await loadRoute()
    await POST(req({ url: 'https://docs.google.com/spreadsheets/d/sheet-123/edit' }))
    expect(tableResults.listing_import_batches!.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'discarded' }),
    )
    expect(tableResults.listing_import_batches!.eq).toHaveBeenCalledWith('status', 'preview')
  })

  it('leaves the Drive sync’s per-file previews alone, and tags its own batch as a pasted link', async () => {
    const { POST } = await loadRoute()
    await POST(req({ url: 'https://docs.google.com/spreadsheets/d/sheet-123/edit' }))
    expect(tableResults.listing_import_batches!.is).toHaveBeenCalledWith('drive_file_id', null)
    expect(tableResults.listing_import_batches!.insert).toHaveBeenCalledWith(expect.objectContaining({ source: 'sheet_link' }))
  })

  it('returns 500 when reading existing listings fails', async () => {
    tableResults.listings = makeChain({ data: null, error: { message: 'db down' } })
    const { POST } = await loadRoute()
    const res = await POST(req({ url: 'https://docs.google.com/spreadsheets/d/sheet-123/edit' }))
    expect(res.status).toBe(500)
  })

  it('returns 500 when the insert fails', async () => {
    tableResults.listing_import_batches = makeChain({ data: null, error: { message: 'insert failed' } })
    const { POST } = await loadRoute()
    const res = await POST(req({ url: 'https://docs.google.com/spreadsheets/d/sheet-123/edit' }))
    expect(res.status).toBe(500)
  })
})

describe('GET /api/admin/listings/import', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRequireAdmin.mockReset()
    mockFrom.mockClear()
    mockRequireAdmin.mockResolvedValue({ supabase: {}, userId: 'admin-1' })
    vi.unstubAllEnvs()
  })

  it('is admin-only', async () => {
    mockRequireAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    tableResults = {
      listing_import_batches: makeChain({ data: null, error: null }),
    }
    const { GET } = await loadRoute()
    const res = await GET()
    expect(res.status).toBe(403)
  })

  it('returns the live preview, history, and lastUrl from the preview', async () => {
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1
        ? makeChain({ data: { id: 'p1', sheet_url: 'https://docs.google.com/spreadsheets/d/p1/edit', status: 'preview' }, error: null })
        : makeChain({ data: [{ id: 'h1', sheet_url: 'https://docs.google.com/spreadsheets/d/h1/edit', status: 'published' }], error: null })
    })
    const { GET } = await loadRoute()
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.preview).toMatchObject({ id: 'p1' })
    expect(body.history).toHaveLength(1)
    expect(body.lastUrl).toBe('https://docs.google.com/spreadsheets/d/p1/edit')
  })

  it('shows only the pasted-link preview here (Drive previews live on the Sync page)', async () => {
    const chains: ReturnType<typeof makeChain>[] = []
    mockFrom.mockImplementation(() => {
      const c = makeChain({ data: null, error: null })
      chains.push(c)
      return c
    })
    const { GET } = await loadRoute()
    await GET()
    expect(chains[0]!.is).toHaveBeenCalledWith('drive_file_id', null)
  })

  it('falls back to the most recent history sheet_url when there is no preview', async () => {
    let call = 0
    mockFrom.mockImplementation(() => {
      call += 1
      return call === 1
        ? makeChain({ data: null, error: null })
        : makeChain({ data: [{ id: 'h1', sheet_url: 'https://docs.google.com/spreadsheets/d/h1/edit', status: 'published' }], error: null })
    })
    const { GET } = await loadRoute()
    const res = await GET()
    const body = await res.json()
    expect(body.preview).toBeNull()
    expect(body.lastUrl).toBe('https://docs.google.com/spreadsheets/d/h1/edit')
  })

  it('falls back to GOOGLE_SHEETS_ID when there is no batch at all', async () => {
    vi.stubEnv('GOOGLE_SHEETS_ID', 'default-sheet-id')
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }))
    const { GET } = await loadRoute()
    const res = await GET()
    const body = await res.json()
    expect(body.lastUrl).toBe('https://docs.google.com/spreadsheets/d/default-sheet-id/edit')
  })

  it('returns null lastUrl when there is no batch and no default sheet id', async () => {
    mockFrom.mockImplementation(() => makeChain({ data: null, error: null }))
    const { GET } = await loadRoute()
    const res = await GET()
    const body = await res.json()
    expect(body.lastUrl).toBeNull()
  })

  it('returns 500 when the query fails', async () => {
    mockFrom.mockImplementation(() => makeChain({ data: null, error: { message: 'db down' } }))
    const { GET } = await loadRoute()
    const res = await GET()
    expect(res.status).toBe(500)
  })
})
