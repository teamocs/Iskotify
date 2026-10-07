import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const mockRequireAdmin = vi.fn()
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => mockRequireAdmin() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

/** maybeSingle() resolves `single`; awaiting the chain resolves `awaited`. */
function makeChain(single: { data?: unknown; error?: unknown }, awaited: { data?: unknown; error?: unknown } = single) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'update', 'upsert']) chain[m] = vi.fn(() => chain)
  chain.maybeSingle = vi.fn(() => Promise.resolve(single))
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(awaited).then(resolve, reject)
  return chain as Record<string, ReturnType<typeof vi.fn>>
}

let tables: Record<string, ReturnType<typeof makeChain>>
const from = vi.fn((t: string) => tables[t])

const UUID = '7c1e3f0a-1b2c-4d5e-8f90-0123456789ab'
const params = (id = UUID) => ({ params: Promise.resolve({ id }) })
const req = (body?: unknown) => ({ json: async () => { if (body === undefined) throw new Error('no body'); return body } }) as unknown as import('next/server').NextRequest

const update = (id: string, verified: boolean) => ({
  id, report_date: '2026-06-14', severity: verified ? 'urgent' : 'info', school_slug: null, school_name: 'PUP — PUPCET',
  title: `T ${id}`, body: 'B', action_required: null, event_date: null, event_type: null, sources: [], verified,
})
const ROWS = [
  { id: 'a', action: 'new', changes: [], section: 'urgent', quote: 'q', update: update('a', true) },
  { id: 'b', action: 'update', changes: ['title'], section: 'urgent', quote: 'q', update: update('b', true) },
  { id: 'c', action: 'unchanged', changes: [], section: 'info', quote: 'q', update: update('c', true) },
  { id: 'd', action: 'new', changes: [], section: 'social', quote: 'q', update: update('d', false) },
]
const BATCH = { id: UUID, status: 'preview', file_name: 'Weekly report', rows: ROWS }

describe('POST /api/admin/announcements/import/[id]/publish', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRequireAdmin.mockReset()
    from.mockClear()
    mockRequireAdmin.mockResolvedValue({ supabase: { from }, userId: 'admin-1' })
    tables = {
      announcement_import_batches: makeChain({ data: BATCH, error: null }, { data: [{ id: UUID }], error: null }),
      admissions_updates: makeChain({ data: null, error: null }),
    }
  })

  const load = () => import('../publish/route')

  it('is admin-only', async () => {
    mockRequireAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    const { POST } = await load()
    expect((await POST(req({}), params())).status).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects a malformed id or exclude list with 400', async () => {
    const { POST } = await load()
    expect((await POST(req({}), params('x'))).status).toBe(400)
    expect((await POST(req({ excludeIds: 'a' }), params())).status).toBe(400)
    expect((await POST(req({ excludeIds: [1] }), params())).status).toBe(400)
  })

  it('404s for an unknown batch and 409s for one already published or discarded', async () => {
    const { POST } = await load()
    tables.announcement_import_batches = makeChain({ data: null, error: null })
    expect((await POST(req(), params())).status).toBe(404)
    tables.announcement_import_batches = makeChain({ data: { ...BATCH, status: 'published' }, error: null })
    const res = await POST(req(), params())
    expect(res.status).toBe(409)
    expect(tables.admissions_updates!.upsert).not.toHaveBeenCalled()
  })

  it('upserts new and updated rows on id — verified (admin reviewed), social findings left unverified', async () => {
    const { POST } = await load()
    const res = await POST(req(), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ published: 3, excluded: 0 })

    const upserts = tables.admissions_updates!.upsert!.mock.calls
    expect(upserts).toHaveLength(2)
    const [verifiedRows, verifiedOpts] = upserts[0]!
    expect(verifiedOpts).toEqual({ onConflict: 'id' })
    expect(verifiedRows.map((r: { id: string }) => r.id)).toEqual(['a', 'b'])
    expect(verifiedRows[0]).toMatchObject({ verified: true, updated_at: expect.any(String) })
    // Social: no verified key, so a new row defaults to false and an admin's earlier verification stays.
    const [socialRows] = upserts[1]!
    expect(socialRows.map((r: { id: string }) => r.id)).toEqual(['d'])
    expect(socialRows[0]).not.toHaveProperty('verified')

    const batch = tables.announcement_import_batches!
    expect(batch.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'published', published_by: 'admin-1', published_count: 3, published_at: expect.any(String) }))
    // Only a batch still in preview can be marked published.
    expect(batch.eq).toHaveBeenCalledWith('status', 'preview')
  })

  it('leaves out the rows the admin excluded', async () => {
    const { POST } = await load()
    const res = await POST(req({ excludeIds: ['b', 'd'] }), params())
    expect(await res.json()).toMatchObject({ published: 1, excluded: 2 })
    expect(tables.admissions_updates!.upsert).toHaveBeenCalledTimes(1)
    expect(tables.admissions_updates!.upsert!.mock.calls[0]![0].map((r: { id: string }) => r.id)).toEqual(['a'])
  })

  it('refuses to publish nothing', async () => {
    const { POST } = await load()
    const res = await POST(req({ excludeIds: ['a', 'b', 'd'] }), params())
    expect(res.status).toBe(400)
    expect(tables.admissions_updates!.upsert).not.toHaveBeenCalled()
  })

  it('answers 409 when another publish got there first (idempotent: the rows were the same upsert)', async () => {
    tables.announcement_import_batches = makeChain({ data: BATCH, error: null }, { data: [], error: null })
    const { POST } = await load()
    const res = await POST(req(), params())
    expect(res.status).toBe(409)
  })

  it('reports a failed write as 500 and leaves the batch in preview', async () => {
    tables.admissions_updates = makeChain({ data: null, error: null }, { data: null, error: { message: 'db down' } })
    const { POST } = await load()
    const res = await POST(req(), params())
    expect(res.status).toBe(500)
    expect(tables.announcement_import_batches!.update).not.toHaveBeenCalled()
  })
})

describe('DELETE /api/admin/announcements/import/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRequireAdmin.mockReset()
    from.mockClear()
    mockRequireAdmin.mockResolvedValue({ supabase: { from }, userId: 'admin-1' })
    tables = { announcement_import_batches: makeChain({ data: { status: 'preview' }, error: null }, { data: [{ id: UUID }], error: null }) }
  })

  const load = () => import('../route')

  it('is admin-only', async () => {
    mockRequireAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) })
    const { DELETE } = await load()
    expect((await DELETE(req(), params())).status).toBe(401)
  })

  it('validates the id, 404s an unknown batch and 409s one that is not in preview', async () => {
    const { DELETE } = await load()
    expect((await DELETE(req(), params('nope'))).status).toBe(400)
    tables.announcement_import_batches = makeChain({ data: null, error: null })
    expect((await DELETE(req(), params())).status).toBe(404)
    tables.announcement_import_batches = makeChain({ data: { status: 'discarded' }, error: null })
    expect((await DELETE(req(), params())).status).toBe(409)
  })

  it('discards a preview batch (it moves to history)', async () => {
    const { DELETE } = await load()
    const res = await DELETE(req(), params())
    expect(res.status).toBe(200)
    const chain = tables.announcement_import_batches!
    expect(chain.update).toHaveBeenCalledWith({ status: 'discarded', discarded_at: expect.any(String) })
    expect(chain.eq).toHaveBeenCalledWith('id', UUID)
    expect(chain.eq).toHaveBeenCalledWith('status', 'preview')
  })
})
