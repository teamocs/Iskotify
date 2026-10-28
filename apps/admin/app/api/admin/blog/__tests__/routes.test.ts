import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const mockRequireAdmin = vi.fn()
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => mockRequireAdmin() }))
const revalidatePath = vi.fn()
vi.mock('next/cache', () => ({ revalidatePath: (p: string) => revalidatePath(p) }))

type Result = { data?: unknown; error?: unknown }

// Each from(table) takes the next queued result for that table; writes are logged in order.
const log: string[] = []
const writes: { table: string; method: string; args: unknown[] }[] = []
let queues: Record<string, Result[]>

function chainFor(table: string) {
  const result = queues[table]?.shift() ?? { data: null, error: null }
  const chain: Record<string, unknown> = {}
  for (const m of ['select', 'eq', 'update', 'upsert']) {
    chain[m] = vi.fn((...args: unknown[]) => {
      if (m === 'update' || m === 'upsert') { log.push(`${table}.${m}`); writes.push({ table, method: m, args }) }
      return chain
    })
  }
  chain.maybeSingle = vi.fn(() => Promise.resolve(result))
  chain.then = (resolve: (v: unknown) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(result).then(resolve, reject)
  return chain
}

const UUID = '7c1e3f0a-1b2c-4d5e-8f90-0123456789ab'
const params = (id = UUID) => ({ params: Promise.resolve({ id }) })
const req = (body?: unknown) => ({ json: async () => { if (body === undefined) throw new Error('no body'); return body } }) as unknown as import('next/server').NextRequest

const POST_DRAFT = {
  title: 'UPCAT Study Plan', metaTitle: 'Free UPCAT Study Plan', metaDescription: 'A plan.', slug: 'upcat-study-plan',
  bodyMd: 'Start.', faq: [{ q: 'Free?', a: 'Yes.' }], authorName: 'Bryden Basil C. Elizan', authorBio: 'Founder of OCS.',
}
const batch = (p: Record<string, unknown> = {}) => ({ id: UUID, drive_file_id: 'post-1', status: 'preview', action: 'new', post: POST_DRAFT, flags: [], ...p })

beforeEach(() => {
  log.length = 0
  writes.length = 0
  queues = {}
  revalidatePath.mockClear()
  mockRequireAdmin.mockResolvedValue({ supabase: { from: (t: string) => chainFor(t) }, userId: 'admin-1' })
})

describe('POST /api/admin/blog/import/[id]/publish', () => {
  const publish = async (body?: unknown) => (await import('../import/[id]/publish/route')).POST(req(body), params())

  it('requires an admin', async () => {
    mockRequireAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    expect((await publish()).status).toBe(403)
  })

  it('404s an unknown preview and 409s one already handled', async () => {
    queues.blog_import_batches = [{ data: null }]
    expect((await publish()).status).toBe(404)
    queues.blog_import_batches = [{ data: batch({ status: 'published' }) }]
    expect((await publish()).status).toBe(409)
    expect(writes).toEqual([])
  })

  it('refuses a flagged post until the claims are confirmed', async () => {
    queues.blog_import_batches = [{ data: batch({ flags: ['Says “no subscription”.'] }) }]
    const res = await publish()
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/claims/i)
    expect(writes).toEqual([])
  })

  it('claims the preview, then publishes the post by Drive file and refreshes its pages', async () => {
    queues.blog_import_batches = [{ data: batch() }, { data: [{ id: UUID }] }]
    queues.blog_posts = [{ data: [] }, { data: null, error: null }]
    const res = await publish()
    expect(res.status).toBe(200)
    expect(log).toEqual(['blog_import_batches.update', 'blog_posts.upsert'])
    const upsert = writes.find(w => w.method === 'upsert')!
    expect(upsert.args[0]).toMatchObject({
      drive_file_id: 'post-1', slug: 'upcat-study-plan', title: 'UPCAT Study Plan', meta_title: 'Free UPCAT Study Plan',
      body_md: 'Start.', faq: [{ q: 'Free?', a: 'Yes.' }], author_name: 'Bryden Basil C. Elizan', status: 'published',
    })
    expect(upsert.args[1]).toEqual({ onConflict: 'drive_file_id' })
    expect(revalidatePath).toHaveBeenCalledWith('/blog')
    expect(revalidatePath).toHaveBeenCalledWith('/blog/upcat-study-plan')
  })

  it('publishes a flagged post once its claims are confirmed', async () => {
    queues.blog_import_batches = [{ data: batch({ flags: ['x'] }) }, { data: [{ id: UUID }] }]
    queues.blog_posts = [{ data: [] }, { data: null, error: null }]
    expect((await publish({ confirmFlags: true })).status).toBe(200)
  })

  it('puts the preview back when another post holds the slug', async () => {
    queues.blog_import_batches = [{ data: batch() }, { data: [{ id: UUID }] }, { data: null }]
    queues.blog_posts = [{ data: [] }, { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "blog_posts_slug_key"' } }]
    const res = await publish()
    expect(res.status).toBe(409)
    expect(log).toEqual(['blog_import_batches.update', 'blog_posts.upsert', 'blog_import_batches.update'])
    expect(writes[2]!.args[0]).toMatchObject({ status: 'preview', published_at: null, published_by: null })
  })
})

describe('DELETE /api/admin/blog/import/[id] (discard)', () => {
  it('discards a preview without publishing anything', async () => {
    queues.blog_import_batches = [{ data: { status: 'preview' } }, { data: [{ id: UUID }] }]
    const res = await (await import('../import/[id]/route')).DELETE(req(), params())
    expect(res.status).toBe(200)
    expect(writes).toEqual([expect.objectContaining({ table: 'blog_import_batches', method: 'update', args: [expect.objectContaining({ status: 'discarded' })] })])
  })
})

describe('PATCH /api/admin/blog/posts/[id]', () => {
  const patch = async (body: unknown) => (await import('../posts/[id]/route')).PATCH(req(body), params())

  it('rejects anything but published/unpublished', async () => {
    expect((await patch({ status: 'deleted' })).status).toBe(400)
  })

  it('unpublishes a live post and refreshes its pages', async () => {
    queues.blog_posts = [{ data: [{ slug: 'upcat-study-plan' }] }]
    const res = await patch({ status: 'unpublished' })
    expect(res.status).toBe(200)
    expect(writes[0]).toMatchObject({ table: 'blog_posts', method: 'update', args: [{ status: 'unpublished' }] })
    expect(revalidatePath).toHaveBeenCalledWith('/blog/upcat-study-plan')
  })

  it('404s an unknown post', async () => {
    queues.blog_posts = [{ data: [] }]
    expect((await patch({ status: 'unpublished' })).status).toBe(404)
  })
})
