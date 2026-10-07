import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const mockRequireAdmin = vi.fn()
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => mockRequireAdmin() }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))

// A thenable query-builder stub: every chain method returns itself and the
// chain resolves to the configured result, like supabase-js.
function makeChain(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'order', 'insert', 'update', 'delete']) chain[m] = vi.fn(() => chain)
  chain.single = vi.fn(() => Promise.resolve(result))
  chain.maybeSingle = vi.fn(() => Promise.resolve(result))
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)
  return chain as Record<string, ReturnType<typeof vi.fn>> & { then: unknown }
}

let chain: ReturnType<typeof makeChain>
const from = vi.fn(() => chain)

const ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz012345'
const UUID = '7c1e3f0a-1b2c-4d5e-8f90-0123456789ab'
const ROW = { id: UUID, content_type: 'announcements', folder_id: ID, label: 'Weekly reports', enabled: true }

const json = (body: unknown) => ({ json: async () => body }) as unknown as import('next/server').NextRequest
const withQuery = (q: string) => ({ nextUrl: new URL(`http://localhost/api/admin/drive-sources${q}`) }) as unknown as import('next/server').NextRequest

async function load() {
  return import('../route')
}

describe('/api/admin/drive-sources', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRequireAdmin.mockReset()
    from.mockClear()
    mockRequireAdmin.mockResolvedValue({ supabase: { from }, userId: 'admin-1' })
    chain = makeChain({ data: ROW, error: null })
    vi.stubEnv('GOOGLE_SERVICE_ACCOUNT_JSON', JSON.stringify({ client_email: 'sync@x.iam.gserviceaccount.com', private_key: 'SECRET' }))
  })

  it.each(['GET', 'POST', 'PATCH', 'DELETE'] as const)('%s is admin-only', async (method) => {
    mockRequireAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    const route = await load()
    const res = method === 'GET' ? await route.GET()
      : method === 'DELETE' ? await route.DELETE(withQuery(`?id=${UUID}`))
      : await route[method](json({}))
    expect(res.status).toBe(403)
    expect(from).not.toHaveBeenCalled()
  })

  it('GET lists the sources and the service-account email, never the key', async () => {
    chain = makeChain({ data: [ROW], error: null })
    const { GET } = await load()
    const res = await GET()
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toEqual({ sources: [ROW], serviceAccountEmail: 'sync@x.iam.gserviceaccount.com' })
    expect(JSON.stringify(body)).not.toContain('SECRET')
  })

  it('POST adds a source from a pasted folder link', async () => {
    const { POST } = await load()
    const res = await POST(json({ folder: `https://drive.google.com/drive/folders/${ID}?usp=sharing`, contentType: 'announcements', label: '  Weekly reports  ' }))
    expect(res.status).toBe(201)
    expect(chain.insert).toHaveBeenCalledWith({ folder_id: ID, content_type: 'announcements', label: 'Weekly reports', enabled: true })
    expect(await res.json()).toEqual(ROW)
  })

  it('POST rejects a bad folder, an unknown type or an over-long label with 400', async () => {
    const { POST } = await load()
    expect((await POST(json({ folder: 'https://example.com/folders/x', contentType: 'listings' }))).status).toBe(400)
    expect((await POST(json({ folder: ID, contentType: 'schools' }))).status).toBe(400)
    expect((await POST(json({ folder: ID, contentType: 'listings', label: 'x'.repeat(200) }))).status).toBe(400)
    expect((await POST(json(null))).status).toBe(400)
    expect(chain.insert).not.toHaveBeenCalled()
  })

  it('POST answers 409 for a folder already added with that type', async () => {
    chain = makeChain({ data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } })
    const { POST } = await load()
    const res = await POST(json({ folder: ID, contentType: 'listings' }))
    expect(res.status).toBe(409)
    expect((await res.json()).error).toMatch(/already/)
  })

  it('PATCH toggles enabled and renames', async () => {
    const { PATCH } = await load()
    const res = await PATCH(json({ id: UUID, enabled: false, label: 'Old reports' }))
    expect(res.status).toBe(200)
    expect(chain.update).toHaveBeenCalledWith({ enabled: false, label: 'Old reports' })
    expect(chain.eq).toHaveBeenCalledWith('id', UUID)
  })

  it('PATCH validates the id and the fields', async () => {
    const { PATCH } = await load()
    expect((await PATCH(json({ id: 'nope', enabled: true }))).status).toBe(400)
    expect((await PATCH(json({ id: UUID }))).status).toBe(400)
    expect((await PATCH(json({ id: UUID, enabled: 'yes' }))).status).toBe(400)
    expect(chain.update).not.toHaveBeenCalled()
  })

  it('PATCH answers 404 for an unknown source', async () => {
    chain = makeChain({ data: null, error: null })
    const { PATCH } = await load()
    expect((await PATCH(json({ id: UUID, enabled: true }))).status).toBe(404)
  })

  it('DELETE removes a source by id', async () => {
    chain = makeChain({ data: [{ id: UUID }], error: null })
    const { DELETE } = await load()
    const res = await DELETE(withQuery(`?id=${UUID}`))
    expect(res.status).toBe(200)
    expect(chain.delete).toHaveBeenCalled()
    expect(chain.eq).toHaveBeenCalledWith('id', UUID)
  })

  it('DELETE validates the id and answers 404 for an unknown one', async () => {
    const { DELETE } = await load()
    expect((await DELETE(withQuery('?id=../../etc'))).status).toBe(400)
    chain = makeChain({ data: [], error: null })
    expect((await DELETE(withQuery(`?id=${UUID}`))).status).toBe(404)
  })

  it('reports a database failure as 500', async () => {
    chain = makeChain({ data: null, error: { message: 'relation "drive_sources" does not exist' } })
    const { GET } = await load()
    expect((await GET()).status).toBe(500)
  })
})
