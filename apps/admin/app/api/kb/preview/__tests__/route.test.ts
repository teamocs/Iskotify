import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockRequireAdmin = vi.fn()
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => mockRequireAdmin() }))
const mockPreview = vi.fn()
vi.mock('@/lib/kb/previewKbFile', () => ({ previewKbFile: (...a: unknown[]) => mockPreview(...a) }))

const db = { tag: 'service' }
const req = (q: string) => new NextRequest(`http://localhost/api/kb/preview${q}`)

describe('GET /api/kb/preview', () => {
  beforeEach(() => {
    vi.resetModules()
    mockPreview.mockReset()
    mockRequireAdmin.mockResolvedValue({ supabase: db })
  })

  it('is admin-only', async () => {
    mockRequireAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    const { GET } = await import('../route')
    expect((await GET(req('?driveFileId=f1'))).status).toBe(403)
  })

  it('requires a valid driveFileId', async () => {
    const { GET } = await import('../route')
    expect((await GET(req(''))).status).toBe(400)
  })

  it('passes the filter and paging through, defaulting unknown filters to all', async () => {
    mockPreview.mockResolvedValue({ total: 0, counts: {}, items: [] })
    const { GET } = await import('../route')
    await GET(req('?driveFileId=f1&filter=held&offset=25&limit=10'))
    expect(mockPreview).toHaveBeenLastCalledWith(db, 'f1', { filter: 'held', offset: 25, limit: 10 })
    await GET(req('?driveFileId=f1&filter=nope'))
    expect(mockPreview).toHaveBeenLastCalledWith(db, 'f1', { filter: 'all', offset: 0, limit: 25 })
  })

  it('404s for a file that is not in the ledger', async () => {
    mockPreview.mockRejectedValue(new Error('Drive file f9 not found in the sync ledger'))
    const { GET } = await import('../route')
    expect((await GET(req('?driveFileId=f9'))).status).toBe(404)
  })
})
