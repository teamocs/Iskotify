import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

const VALID_SECRET = 'test-secret-123'

vi.stubEnv('SYNC_SECRET', VALID_SECRET)
vi.stubEnv('GOOGLE_SHEETS_ID', 'fake-sheet-id')
vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')
vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', JSON.stringify({ type: 'service_account', project_id: 'fake' }))

const DEFAULT_SHEET_VALUES = [
  ['type', 'title', 'slug', 'provider', 'description', 'requirements',
   'coverage', 'deadline', 'exam_date', 'results_date', 'events',
   'target_courses', 'target_year_levels', 'tags', 'status', 'region',
   'grant_amount', 'external_url', 'image_url'],
  ['scholarship', 'DOST-SEI 2026', 'dost-sei-2026', 'DOST', 'A scholarship',
   '', '', '2026-02-28', '', '', '', '', '', '', 'active', 'Nationwide', '', '', ''],
]

const mockSheetsGet = vi.fn().mockResolvedValue({ data: { values: DEFAULT_SHEET_VALUES } })

vi.mock('googleapis', () => ({
  google: {
    auth: {
      GoogleAuth: vi.fn().mockImplementation(() => ({})),
    },
    sheets: vi.fn(() => ({
      spreadsheets: {
        values: {
          get: mockSheetsGet,
        },
      },
    })),
  },
}))

const mockSelectAfterUpdate = vi.fn().mockResolvedValue({ data: [], error: null })
const mockNotFilter = vi.fn(() => ({ select: mockSelectAfterUpdate }))
const mockUpdate = vi.fn(() => ({ not: mockNotFilter }))
const mockUpsert = vi.fn().mockResolvedValue({ error: null })
const mockFrom = vi.fn(() => ({ upsert: mockUpsert, update: mockUpdate }))

vi.mock('@iskotify/utils', async () => {
  const actual = await vi.importActual<typeof import('@iskotify/utils')>('@iskotify/utils')
  return {
    ...actual,
    createServerClient: vi.fn(() => ({ from: mockFrom })),
  }
})

async function importRoute() {
  const mod = await import('../route')
  return mod.POST
}

function makeRequest(authHeader?: string) {
  return new NextRequest('http://localhost:3000/api/sheets/sync', {
    method: 'POST',
    headers: authHeader ? { authorization: authHeader } : {},
  })
}

describe('POST /api/sheets/sync', () => {
  beforeEach(() => {
    vi.resetModules()
    mockSheetsGet.mockClear()
    mockUpsert.mockClear()
    mockFrom.mockClear()
    mockUpdate.mockClear()
    mockNotFilter.mockClear()
    mockSelectAfterUpdate.mockClear()
  })

  it('returns 401 when Authorization header is missing', async () => {
    const POST = await importRoute()
    const res = await POST(makeRequest())
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 401 when secret is wrong', async () => {
    const POST = await importRoute()
    const res = await POST(makeRequest('Bearer wrong-secret'))
    expect(res.status).toBe(401)
    const body = await res.json()
    expect(body.error).toBe('Unauthorized')
  })

  it('returns 500 when SYNC_SECRET is not configured', async () => {
    vi.stubEnv('SYNC_SECRET', '')
    const POST = await importRoute()
    const res = await POST(makeRequest('Bearer '))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Server misconfiguration')
    vi.stubEnv('SYNC_SECRET', VALID_SECRET)
  })

  it('returns 200 with synced/skipped/closed counts on valid request', async () => {
    const POST = await importRoute()
    const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toHaveProperty('synced')
    expect(body).toHaveProperty('skipped')
    expect(body).toHaveProperty('closed')
    expect(typeof body.synced).toBe('number')
  })

  it('calls supabase upsert with valid rows', async () => {
    const POST = await importRoute()
    await POST(makeRequest(`Bearer ${VALID_SECRET}`))
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ slug: 'dost-sei-2026' })]),
      { onConflict: 'slug' }
    )
  })

  it('returns {synced:0,skipped:0,closed:0} when sheet is empty', async () => {
    mockSheetsGet.mockResolvedValueOnce({ data: { values: [] } })
    const POST = await importRoute()
    const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ synced: 0, skipped: 0, closed: 0 })
  })

  it('returns {synced:0,skipped:1,closed:0} when all rows are invalid', async () => {
    mockSheetsGet.mockResolvedValueOnce({
      data: {
        values: [
          ['type', 'title', 'slug', 'provider', 'description', 'requirements',
           'coverage', 'deadline', 'exam_date', 'results_date', 'events',
           'target_courses', 'target_year_levels', 'tags', 'status', 'region',
           'grant_amount', 'external_url', 'image_url'],
          ['invalid_type', 'Bad Row', 'bad-row', '', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''],
        ],
      },
    })
    const POST = await importRoute()
    const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ synced: 0, skipped: 1, closed: 0 })
  })

  it('returns 500 when supabase upsert fails', async () => {
    mockUpsert.mockResolvedValueOnce({ error: { message: 'DB connection failed' } })
    const POST = await importRoute()
    const res = await POST(makeRequest(`Bearer ${VALID_SECRET}`))
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('Database error')
  })
})
