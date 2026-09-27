import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const mockRequireAdmin = vi.fn()
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => mockRequireAdmin() }))

const mockRevalidateTag = vi.fn()
const mockRevalidatePath = vi.fn()
vi.mock('next/cache', () => ({
  revalidateTag: (...a: unknown[]) => mockRevalidateTag(...a),
  revalidatePath: (...a: unknown[]) => mockRevalidatePath(...a),
}))

function makeChain(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    in: vi.fn(() => chain),
    update: vi.fn(() => chain),
    upsert: vi.fn(() => chain),
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

function req(body: unknown = {}) {
  return { json: async () => body } as unknown as import('next/server').NextRequest
}

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function loadRoute() {
  return import('../route')
}

const NEW_LISTING = {
  slug: 'new-one', title: 'New One', type: 'scholarship', provider: 'X', description: '', requirements: [],
  coverage: '', deadline: null, exam_date: null, results_date: null, events: [], target_courses: [],
  target_year_levels: [], tags: [], status: 'active', region: 'NCR', grant_amount: null, external_url: '', image_url: '',
  province: null, city: null, scope: 'national', is_verified: false, income_ceiling: null, gwa_requirement: null,
  monthly_stipend: null, service_obligation_years: null, has_entrance_exam: false, application_window: null, scholarship_meta: null,
}

const UPDATE_LISTING = {
  ...NEW_LISTING,
  slug: 'existing-one',
  title: 'Existing Updated',
  // Scholarship-only fields present on the row's stored listing (defaults) —
  // publish must not push these into the update patch.
  is_verified: true,
  income_ceiling: 999999,
}

function basePreviewBatch(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'batch-1',
    sheet_id: 'sheet-1',
    sheet_url: 'https://docs.google.com/spreadsheets/d/sheet-1/edit',
    sheet_title: 'My Sheet',
    tab: 'Sheet1',
    status: 'preview',
    rows: [
      { slug: 'new-one', title: 'New One', action: 'new', changes: [], listing: NEW_LISTING },
      { slug: 'existing-one', title: 'Existing Updated', action: 'update', changes: ['title'], listing: UPDATE_LISTING },
      { slug: 'unchanged-one', title: 'Unchanged', action: 'unchanged', changes: [], listing: NEW_LISTING },
    ],
    invalid: [],
    missing: [{ slug: 'gone', title: 'Gone', status: 'active' }],
    column_map: {},
    mapped_by_ai: false,
    new_count: 1,
    update_count: 1,
    unchanged_count: 1,
    invalid_count: 0,
    closed_count: 0,
    created_by: 'admin-1',
    created_at: '2026-01-01T00:00:00.000Z',
    published_by: null,
    published_at: null,
    discarded_at: null,
    ...overrides,
  }
}

describe('POST /api/admin/listings/import/[id]/publish', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRequireAdmin.mockReset()
    mockRevalidateTag.mockReset()
    mockRevalidatePath.mockReset()
    mockFrom.mockClear()
    mockRequireAdmin.mockResolvedValue({ supabase: {}, userId: 'admin-1' })

    tableResults = {
      listing_import_batches: makeChain({ data: basePreviewBatch(), error: null }),
      listings: makeChain({ data: [{ id: 'x' }], error: null }),
      sync_logs: makeChain({ data: null, error: null }),
    }
  })

  it('is admin-only', async () => {
    mockRequireAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    const { POST } = await loadRoute()
    const res = await POST(req(), params('batch-1'))
    expect(res.status).toBe(403)
  })

  it('404s when the batch does not exist', async () => {
    tableResults.listing_import_batches = makeChain({ data: null, error: null })
    const { POST } = await loadRoute()
    const res = await POST(req(), params('missing'))
    expect(res.status).toBe(404)
  })

  it('409s when the batch is not in preview', async () => {
    tableResults.listing_import_batches = makeChain({ data: basePreviewBatch({ status: 'published' }), error: null })
    const { POST } = await loadRoute()
    const res = await POST(req(), params('batch-1'))
    expect(res.status).toBe(409)
  })

  it('upserts new rows and patches only sheet-owned fields on update rows', async () => {
    // First call to listings.upsert (new rows), subsequent calls to
    // listings.update (one per update row) share the same chain object here
    // since only one update row exists.
    const { POST } = await loadRoute()
    const res = await POST(req({}), params('batch-1'))
    expect(res.status).toBe(200)

    const listingsChain = tableResults.listings!
    expect(listingsChain.upsert).toHaveBeenCalledWith(
      [expect.objectContaining({ slug: 'new-one', updated_at: expect.any(String) })],
      { onConflict: 'slug' },
    )
    expect(listingsChain.update).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Existing Updated', updated_at: expect.any(String) }),
    )
    const updatePatch = (listingsChain.update as ReturnType<typeof vi.fn>).mock.calls[0]![0]
    expect(updatePatch).not.toHaveProperty('is_verified')
    expect(updatePatch).not.toHaveProperty('income_ceiling')
    expect(updatePatch).not.toHaveProperty('slug')
    expect(listingsChain.eq).toHaveBeenCalledWith('slug', 'existing-one')
  })

  it('patches (not overwrites) a "new" row whose slug was created by someone after the preview', async () => {
    // The listing now exists, e.g. added by hand while the preview sat open.
    tableResults.listings = makeChain({ data: [{ id: 'x', slug: 'new-one' }], error: null })
    const { POST } = await loadRoute()
    const res = await POST(req({}), params('batch-1'))
    expect(res.status).toBe(200)
    const listingsChain = tableResults.listings!
    expect(listingsChain.upsert).not.toHaveBeenCalled()
    const patches = (listingsChain.update as ReturnType<typeof vi.fn>).mock.calls.map(c => c[0])
    expect(patches.some(p => p.title === 'New One' && !('is_verified' in p) && !('province' in p))).toBe(true)
    expect(listingsChain.eq).toHaveBeenCalledWith('slug', 'new-one')
  })

  it('does not close anything when closeMissing is not set', async () => {
    const { POST } = await loadRoute()
    await POST(req({}), params('batch-1'))
    // listings.update is called once for the update row's patch — the only
    // update() invocation should target slug 'existing-one', never 'gone'.
    const calls = (tableResults.listings!.update as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.every(c => c[0].status !== 'closed')).toBe(true)
  })

  it('closes exactly the batch missing slugs when closeMissing is true', async () => {
    const { POST } = await loadRoute()
    const res = await POST(req({ closeMissing: true }), params('batch-1'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.closed).toBe(1)
    const calls = (tableResults.listings!.update as ReturnType<typeof vi.fn>).mock.calls
    const closeCall = calls.find(c => c[0].status === 'closed')
    expect(closeCall).toBeTruthy()
    expect(tableResults.listings!.in).toHaveBeenCalledWith('slug', ['gone'])
  })

  it('writes one sync_logs row with the sheet title in the message', async () => {
    const { POST } = await loadRoute()
    await POST(req({}), params('batch-1'))
    expect(tableResults.sync_logs!.insert).toHaveBeenCalledWith(
      expect.objectContaining({ synced: 2, skipped: 0, status: 'ok', message: 'Sheet "My Sheet"' }),
    )
  })

  it('marks sync_logs status warn when the batch has invalid rows', async () => {
    tableResults.listing_import_batches = makeChain({ data: basePreviewBatch({ invalid_count: 3 }), error: null })
    const { POST } = await loadRoute()
    await POST(req({}), params('batch-1'))
    expect(tableResults.sync_logs!.insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'warn', skipped: 3 }),
    )
  })

  it('marks the batch published with published_by and revalidates listings', async () => {
    const { POST } = await loadRoute()
    await POST(req({}), params('batch-1'))
    expect(tableResults.listing_import_batches!.update).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'published', published_by: 'admin-1' }),
    )
    expect(mockRevalidateTag).toHaveBeenCalledWith('listings')
    expect(mockRevalidatePath).toHaveBeenCalledWith('/admin/listings')
  })

  it('returns 500 when an upsert fails', async () => {
    tableResults.listings = makeChain({ data: null, error: { message: 'db down' } })
    const { POST } = await loadRoute()
    const res = await POST(req({}), params('batch-1'))
    expect(res.status).toBe(500)
  })
})
