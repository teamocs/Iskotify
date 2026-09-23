import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextResponse } from 'next/server'

const mockRequireAdmin = vi.fn()
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => mockRequireAdmin() }))

const mockPublish = vi.fn()
vi.mock('@/lib/kb/publishKbFile', () => ({ publishKbFile: (...a: unknown[]) => mockPublish(...a) }))

function req(body: unknown) {
  return { json: async () => body } as unknown as import('next/server').NextRequest
}

async function load() {
  return (await import('../route')).POST
}

describe('POST /api/kb/publish', () => {
  const db = { tag: 'service' }
  beforeEach(() => {
    vi.resetModules()
    mockRequireAdmin.mockReset()
    mockPublish.mockReset()
    mockRequireAdmin.mockResolvedValue({ supabase: db })
    mockPublish.mockResolvedValue({ published: 5, alreadyPublished: 0, skippedMissingMedia: 1, skippedFewOptions: 0, skippedDuplicate: 0 })
  })

  it('is admin-only', async () => {
    mockRequireAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    const POST = await load()
    const res = await POST(req({ driveFileId: 'f1' }))
    expect(res.status).toBe(403)
    expect(mockPublish).not.toHaveBeenCalled()
  })

  it('requires a driveFileId', async () => {
    const POST = await load()
    const res = await POST(req({}))
    expect(res.status).toBe(400)
  })

  it('publishes the file and returns the counts', async () => {
    const POST = await load()
    const res = await POST(req({ driveFileId: 'f1' }))
    expect(res.status).toBe(200)
    expect(mockPublish).toHaveBeenCalledWith(db, 'f1')
    expect(await res.json()).toMatchObject({ published: 5, skippedMissingMedia: 1 })
  })

  it('returns 404 for a file not in the ledger', async () => {
    mockPublish.mockRejectedValue(new Error('Drive file f9 not found in the sync ledger'))
    const POST = await load()
    const res = await POST(req({ driveFileId: 'f9' }))
    expect(res.status).toBe(404)
  })
})
