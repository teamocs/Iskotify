import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const mockRequireAdmin = vi.fn()
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => mockRequireAdmin() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

type Result = { data?: unknown; error?: unknown }

// Every db call is logged ("table.method"), and each from() takes the next
// result queued for its table, so the order of reads/writes is checkable.
const log: string[] = []
const writes: { table: string; method: string; args: unknown[] }[] = []
let queues: Record<string, Result[]>

function chainFor(table: string) {
  const result = queues[table]?.shift() ?? { data: null, error: null }
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'in', 'update', 'upsert']) {
    chain[m] = vi.fn((...args: unknown[]) => {
      if (m === 'update' || m === 'upsert') { log.push(`${table}.${m}`); writes.push({ table, method: m, args }) }
      return chain
    })
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result))
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)
  return chain
}
const from = vi.fn((t: string) => chainFor(t))

const UUID = '7c1e3f0a-1b2c-4d5e-8f90-0123456789ab'
const params = (id = UUID) => ({ params: Promise.resolve({ id }) })
const req = (body?: unknown) => ({ json: async () => { if (body === undefined) throw new Error('no body'); return body } }) as unknown as import('next/server').NextRequest

const update = (id: string, p: Record<string, unknown> = {}) => ({
  id, report_date: '2026-06-14', severity: 'urgent', school_slug: null, school_name: 'PUP — PUPCET',
  title: `T ${id}`, body: 'B', action_required: null, event_date: null, event_type: null,
  sources: [{ label: 'pup.edu.ph', url: 'https://www.pup.edu.ph/iapply' }], verified: true, ...p,
})
const row = (id: string, section: string, action = 'new', p: Record<string, unknown> = {}, u: Record<string, unknown> = {}) =>
  ({ id, action, changes: action === 'update' ? ['title'] : [], section, quote: 'q', warning: null, update: update(id, u), ...p })

const ROWS = [
  row('a', 'urgent'),
  row('b', 'urgent', 'update'),
  row('c', 'info', 'unchanged'),
  row('d', 'social', 'new', {}, { severity: 'info', verified: false }),
]
const CREATED = '2026-06-15T00:00:00Z'
const BATCH = { id: UUID, status: 'preview', file_name: 'Weekly report', created_at: CREATED, rows: ROWS }

const upserts = () => writes.filter(w => w.method === 'upsert').map(w => w.args[0] as Record<string, unknown>[])
const batchUpdates = () => writes.filter(w => w.table === 'announcement_import_batches').map(w => w.args[0] as Record<string, unknown>)

function setQueues(p: { batch?: Result; live?: Result; claim?: Result; upserts?: Result[] } = {}) {
  queues = {
    announcement_import_batches: [p.batch ?? { data: BATCH, error: null }, p.claim ?? { data: [{ id: UUID }], error: null }, { data: null, error: null }],
    admissions_updates: [p.live ?? { data: [], error: null }, ...(p.upserts ?? [{ data: null, error: null }, { data: null, error: null }])],
  }
}

describe('POST /api/admin/announcements/import/[id]/publish', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRequireAdmin.mockReset()
    from.mockClear()
    log.length = 0
    writes.length = 0
    mockRequireAdmin.mockResolvedValue({ supabase: { from }, userId: 'admin-1' })
    setQueues()
  })

  const load = () => import('../publish/route')

  it('is admin-only', async () => {
    mockRequireAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    const { POST } = await load()
    expect((await POST(req({}), params())).status).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })

  it('rejects a malformed id or id lists with 400', async () => {
    const { POST } = await load()
    expect((await POST(req({}), params('x'))).status).toBe(400)
    expect((await POST(req({ excludeIds: 'a' }), params())).status).toBe(400)
    expect((await POST(req({ excludeIds: [1] }), params())).status).toBe(400)
    expect((await POST(req({ confirmIds: [{}] }), params())).status).toBe(400)
  })

  it('404s for an unknown batch and 409s for one already published or discarded', async () => {
    const { POST } = await load()
    setQueues({ batch: { data: null, error: null } })
    expect((await POST(req(), params())).status).toBe(404)
    setQueues({ batch: { data: { ...BATCH, status: 'published' }, error: null } })
    expect((await POST(req(), params())).status).toBe(409)
    expect(upserts()).toHaveLength(0)
  })

  it('claims the batch first, then upserts the new and changed rows on id', async () => {
    const { POST } = await load()
    const res = await POST(req(), params())
    expect(res.status).toBe(200)
    expect(await res.json()).toMatchObject({ published: 3, excluded: 0, skippedStale: [] })
    expect(log).toEqual(['announcement_import_batches.update', 'admissions_updates.upsert', 'admissions_updates.upsert'])
    expect(batchUpdates()[0]).toMatchObject({ status: 'published', published_by: 'admin-1', published_count: 3, published_at: expect.any(String) })
    const [verified, social] = upserts()
    expect(verified!.map(r => r.id)).toEqual(['a', 'b'])
    expect(verified![0]).toMatchObject({ verified: true, updated_at: expect.any(String) })
    // Social: no verified key, so a new row defaults to false and an admin's earlier verification stays.
    expect(social!.map(r => r.id)).toEqual(['d'])
    expect(social![0]).not.toHaveProperty('verified')
  })

  it('takes severity and verified from the report section, not from the stored row', async () => {
    setQueues({ batch: { data: { ...BATCH, rows: [row('a', 'urgent', 'new', {}, { severity: 'info', verified: false }), row('d', 'social', 'new', {}, { severity: 'urgent', verified: true })] }, error: null } })
    const { POST } = await load()
    await POST(req(), params())
    const [verified, social] = upserts()
    expect(verified).toEqual([expect.objectContaining({ id: 'a', severity: 'urgent', verified: true })])
    expect(social).toEqual([expect.objectContaining({ id: 'd', severity: 'info' })])
    expect(social![0]).not.toHaveProperty('verified')
  })

  it('writes sources as {label, url} links, http(s) only, whatever the stored shape', async () => {
    setQueues({ batch: { data: { ...BATCH, rows: [row('a', 'urgent', 'new', {}, { sources: ['https://www.pup.edu.ph/iapply', 'javascript:alert(1)'] })] }, error: null } })
    const { POST } = await load()
    await POST(req(), params())
    expect(upserts()[0]![0]!.sources).toEqual([{ label: 'pup.edu.ph', url: 'https://www.pup.edu.ph/iapply' }])
  })

  it('leaves out the rows the admin excluded', async () => {
    const { POST } = await load()
    const res = await POST(req({ excludeIds: ['b', 'd'] }), params())
    expect(await res.json()).toMatchObject({ published: 1, excluded: 2 })
    expect(upserts()).toHaveLength(1)
    expect(upserts()[0]!.map(r => r.id)).toEqual(['a'])
  })

  it('publishes a flagged row only when the admin confirmed it', async () => {
    const rows = [row('a', 'urgent'), row('e', 'urgent', 'new', { warning: 'The title is mostly not in the quoted text — check it.' })]
    setQueues({ batch: { data: { ...BATCH, rows }, error: null } })
    const { POST } = await load()
    const res = await POST(req(), params())
    expect(await res.json()).toMatchObject({ published: 1, unconfirmed: 1 })
    expect(upserts()[0]!.map(r => r.id)).toEqual(['a'])

    log.length = 0
    writes.length = 0
    setQueues({ batch: { data: { ...BATCH, rows }, error: null } })
    await POST(req({ confirmIds: ['e'] }), params())
    expect(upserts()[0]!.map(r => r.id)).toEqual(['a', 'e'])
  })

  it('refuses to publish nothing', async () => {
    const { POST } = await load()
    const res = await POST(req({ excludeIds: ['a', 'b', 'd'] }), params())
    expect(res.status).toBe(400)
    expect(log).toEqual([])
  })

  it('does not overwrite a live row changed since the preview was made — skips and reports it', async () => {
    setQueues({ live: { data: [{ id: 'b', updated_at: '2026-06-16T00:00:00Z' }, { id: 'a', updated_at: '2026-06-01T00:00:00Z' }], error: null } })
    const { POST } = await load()
    const res = await POST(req(), params())
    expect(await res.json()).toMatchObject({ published: 2, skippedStale: ['b'] })
    expect(upserts()[0]!.map(r => r.id)).toEqual(['a'])
    expect(batchUpdates()[0]).toMatchObject({ published_count: 2 })
  })

  it('answers 409 when every row changed live since the preview', async () => {
    setQueues({ live: { data: ['a', 'b', 'd'].map(id => ({ id, updated_at: '2026-06-16T00:00:00Z' })), error: null } })
    const { POST } = await load()
    const res = await POST(req(), params())
    expect(res.status).toBe(409)
    expect(log).toEqual([])
  })

  it('answers 409 without writing when another publish claimed the batch first', async () => {
    setQueues({ claim: { data: [], error: null } })
    const { POST } = await load()
    const res = await POST(req(), params())
    expect(res.status).toBe(409)
    expect(upserts()).toHaveLength(0)
  })

  it('puts the batch back in preview and reports 500 when the write fails', async () => {
    setQueues({ upserts: [{ data: null, error: { message: 'db down' } }] })
    const { POST } = await load()
    const res = await POST(req(), params())
    expect(res.status).toBe(500)
    expect(batchUpdates()).toHaveLength(2)
    expect(batchUpdates()[1]).toEqual({ status: 'preview', published_at: null, published_by: null, published_count: 0 })
  })
})

describe('DELETE /api/admin/announcements/import/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRequireAdmin.mockReset()
    from.mockClear()
    log.length = 0
    writes.length = 0
    mockRequireAdmin.mockResolvedValue({ supabase: { from }, userId: 'admin-1' })
    queues = { announcement_import_batches: [{ data: { status: 'preview' }, error: null }, { data: [{ id: UUID }], error: null }] }
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
    queues = { announcement_import_batches: [{ data: null, error: null }] }
    expect((await DELETE(req(), params())).status).toBe(404)
    queues = { announcement_import_batches: [{ data: { status: 'discarded' }, error: null }] }
    expect((await DELETE(req(), params())).status).toBe(409)
  })

  it('discards a preview batch (it moves to history), only while it is still in preview', async () => {
    const { DELETE } = await load()
    const res = await DELETE(req(), params())
    expect(res.status).toBe(200)
    expect(batchUpdates()).toEqual([{ status: 'discarded', discarded_at: expect.any(String) }])
  })
})
