import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest, NextResponse } from 'next/server'

const mockRequireAdmin = vi.fn()
vi.mock('@/lib/admin/requireAdmin', () => ({ requireAdmin: () => mockRequireAdmin() }))

const lib = { loadMappingContext: vi.fn(), saveMapping: vi.fn(), clearMapping: vi.fn(), suggestMapping: vi.fn() }
vi.mock('@/lib/kb/fileMapping', () => ({
  loadMappingContext: (...a: unknown[]) => lib.loadMappingContext(...a),
  saveMapping: (...a: unknown[]) => lib.saveMapping(...a),
  clearMapping: (...a: unknown[]) => lib.clearMapping(...a),
  suggestMapping: (...a: unknown[]) => lib.suggestMapping(...a),
}))
vi.mock('@/lib/kb/resyncFile', () => ({ driveResync: vi.fn(() => 'resync') }))

const db = { tag: 'service' }
const url = (q = '') => new NextRequest(`http://localhost/api/kb/mapping${q}`)
const post = (body: unknown) => new NextRequest('http://localhost/api/kb/mapping', { method: 'POST', body: JSON.stringify(body) })

describe('/api/kb/mapping', () => {
  beforeEach(() => {
    vi.resetModules()
    Object.values(lib).forEach(f => f.mockReset())
    mockRequireAdmin.mockResolvedValue({ supabase: db, userId: 'u1' })
  })

  it('is admin-only on every method', async () => {
    mockRequireAdmin.mockResolvedValue({ error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) })
    const route = await import('../route')
    expect((await route.GET(url('?driveFileId=f1'))).status).toBe(403)
    expect((await route.POST(post({ driveFileId: 'f1' }))).status).toBe(403)
    expect((await route.DELETE(url('?driveFileId=f1'))).status).toBe(403)
    const suggest = await import('../suggest/route')
    expect((await suggest.POST(post({ driveFileId: 'f1' }))).status).toBe(403)
    expect(lib.saveMapping).not.toHaveBeenCalled()
  })

  it('rejects a missing or malformed file id', async () => {
    const route = await import('../route')
    expect((await route.GET(url())).status).toBe(400)
    expect((await route.POST(post({ driveFileId: '../x' }))).status).toBe(400)
  })

  it('GET returns the dialog context, 404 when the file is unknown', async () => {
    lib.loadMappingContext.mockResolvedValueOnce({ name: 'F.xlsx', headers: ['A'] }).mockResolvedValueOnce(null)
    const { GET } = await import('../route')
    const ok = await GET(url('?driveFileId=f1'))
    expect(await ok.json()).toMatchObject({ name: 'F.xlsx' })
    expect((await GET(url('?driveFileId=f2'))).status).toBe(404)
  })

  it('POST saves through the lib with a Drive re-sync and passes validation errors through', async () => {
    lib.saveMapping.mockResolvedValueOnce({ ok: true, mapping: { subtest: 'Science' }, summary: { imported: [] } })
    lib.saveMapping.mockResolvedValueOnce({ ok: false, status: 400, error: 'Map the required fields: answer.' })
    const { POST } = await import('../route')
    const res = await POST(post({ driveFileId: 'f1', subtest: 'Science', columns: {} }))
    expect(res.status).toBe(200)
    expect(lib.saveMapping).toHaveBeenCalledWith(db, 'f1', expect.objectContaining({ subtest: 'Science' }), 'resync')
    const bad = await POST(post({ driveFileId: 'f1' }))
    expect(bad.status).toBe(400)
    expect((await bad.json()).error).toMatch(/answer/)
  })

  it('DELETE clears the mapping and re-syncs', async () => {
    lib.clearMapping.mockResolvedValue({ imported: [] })
    const { DELETE } = await import('../route')
    expect((await DELETE(url('?driveFileId=f1'))).status).toBe(200)
    expect(lib.clearMapping).toHaveBeenCalledWith(db, 'f1', 'resync')
  })

  it('suggest returns the AI mapping, or 422 when AI cannot help', async () => {
    lib.suggestMapping.mockResolvedValueOnce({ subtest: 'Science', columns: {} }).mockResolvedValueOnce(null)
    const { POST } = await import('../suggest/route')
    expect(await (await POST(post({ driveFileId: 'f1' }))).json()).toMatchObject({ suggestion: { subtest: 'Science' } })
    expect((await POST(post({ driveFileId: 'f1' }))).status).toBe(422)
  })
})
