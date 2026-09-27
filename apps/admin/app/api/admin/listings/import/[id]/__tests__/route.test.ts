import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const mockRequireAdmin = vi.fn()
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => mockRequireAdmin() }))

function makeChain(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    update: vi.fn(() => chain),
    maybeSingle: vi.fn(() => Promise.resolve(result)),
    then: (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject),
  }
  return chain
}

let chain: ReturnType<typeof makeChain>
const mockFrom = vi.fn(() => chain)

vi.mock('@iskotify/utils', async () => {
  const actual = await vi.importActual<typeof import('@iskotify/utils')>('@iskotify/utils')
  return { ...actual, createServerClient: () => ({ from: mockFrom }) }
})

function req() {
  return {} as unknown as import('next/server').NextRequest
}

function params(id: string) {
  return { params: Promise.resolve({ id }) }
}

async function loadRoute() {
  return import('../route')
}

describe('DELETE /api/admin/listings/import/[id]', () => {
  beforeEach(() => {
    vi.resetModules()
    mockRequireAdmin.mockReset()
    mockFrom.mockClear()
    mockRequireAdmin.mockResolvedValue({ supabase: {}, userId: 'admin-1' })
    chain = makeChain({ data: { status: 'preview' }, error: null })
  })

  it('is admin-only', async () => {
    mockRequireAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    const { DELETE } = await loadRoute()
    const res = await DELETE(req(), params('batch-1'))
    expect(res.status).toBe(403)
  })

  it('404s when the batch does not exist', async () => {
    chain = makeChain({ data: null, error: null })
    const { DELETE } = await loadRoute()
    const res = await DELETE(req(), params('missing'))
    expect(res.status).toBe(404)
  })

  it('409s when the batch is not in preview', async () => {
    chain = makeChain({ data: { status: 'published' }, error: null })
    const { DELETE } = await loadRoute()
    const res = await DELETE(req(), params('batch-1'))
    expect(res.status).toBe(409)
  })

  it('discards a preview batch', async () => {
    const { DELETE } = await loadRoute()
    const res = await DELETE(req(), params('batch-1'))
    expect(res.status).toBe(200)
    expect(chain.update).toHaveBeenCalledWith(expect.objectContaining({ status: 'discarded', discarded_at: expect.any(String) }))
    expect(chain.eq).toHaveBeenCalledWith('id', 'batch-1')
  })

  it('returns 500 when the lookup fails', async () => {
    chain = makeChain({ data: null, error: { message: 'db down' } })
    const { DELETE } = await loadRoute()
    const res = await DELETE(req(), params('batch-1'))
    expect(res.status).toBe(500)
  })
})
