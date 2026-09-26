import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')

// ---- Auth gate ----
const mockGetUser = vi.fn()
const mockRoleSingle = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createAuthClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

// ---- Service-role client: profiles, app_bug_reports (select + delete), storage ----
const mockReportMaybeSingle = vi.fn()
const mockDeleteEq = vi.fn()
const mockDelete = vi.fn(() => ({ eq: mockDeleteEq }))
const mockRemove = vi.fn()
const mockStorageFrom = vi.fn(() => ({ remove: mockRemove }))
const mockFrom = vi.fn((table: string) => {
  if (table === 'profiles') return { select: () => ({ eq: () => ({ single: mockRoleSingle }) }) }
  return {
    select: () => ({ eq: () => ({ maybeSingle: mockReportMaybeSingle }) }),
    delete: mockDelete,
  }
})
vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom, storage: { from: mockStorageFrom } })),
}))

import { DELETE } from '../route'

const call = (id = 'r1') =>
  DELETE(new NextRequest(`http://localhost/api/admin/app-reports/${id}`, { method: 'DELETE' }), { params: Promise.resolve({ id }) })

let errorSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  mockRoleSingle.mockResolvedValue({ data: { role: 'admin' } })
  mockReportMaybeSingle.mockResolvedValue({ data: { image_url: '1727-ab.png' }, error: null })
  mockDeleteEq.mockResolvedValue({ error: null })
  mockRemove.mockResolvedValue({ data: [{ name: '1727-ab.png' }], error: null })
})
afterEach(() => errorSpy.mockRestore())

describe('DELETE /api/admin/app-reports/[id] also removes the screenshot', () => {
  it('403 for a non-admin: deletes nothing, removes nothing', async () => {
    mockRoleSingle.mockResolvedValue({ data: { role: 'student' } })
    const res = await call()
    expect(res.status).toBe(403)
    expect(mockDelete).not.toHaveBeenCalled()
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('deletes the row and removes its screenshot object from the private bucket', async () => {
    const res = await call('r1')
    expect(res.status).toBe(200)
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'r1')
    expect(mockStorageFrom).toHaveBeenCalledWith('app-bug-reports')
    expect(mockRemove).toHaveBeenCalledWith(['1727-ab.png'])
  })

  it('removes the right object for an old row that stored a full public URL', async () => {
    mockReportMaybeSingle.mockResolvedValue({
      data: { image_url: 'https://fake.supabase.co/storage/v1/object/public/app-bug-reports/old-shot.png' },
      error: null,
    })
    await call()
    expect(mockRemove).toHaveBeenCalledWith(['old-shot.png'])
  })

  it('does not touch storage when the report has no screenshot (or points elsewhere)', async () => {
    mockReportMaybeSingle.mockResolvedValue({ data: { image_url: null }, error: null })
    expect((await call()).status).toBe(200)
    mockReportMaybeSingle.mockResolvedValue({ data: { image_url: 'https://evil.example.com/x.png' }, error: null })
    expect((await call()).status).toBe(200)
    expect(mockRemove).not.toHaveBeenCalled()
    expect(mockDeleteEq).toHaveBeenCalledTimes(2)
  })

  it('still deletes the row (200) and logs when removing the object fails', async () => {
    mockRemove.mockResolvedValue({ data: null, error: { message: 'storage down' } })
    const res = await call()
    expect(res.status).toBe(200)
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'r1')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('still deletes the row (200) when removing the object throws', async () => {
    mockRemove.mockRejectedValue(new Error('network'))
    const res = await call()
    expect(res.status).toBe(200)
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'r1')
    expect(errorSpy).toHaveBeenCalled()
  })

  it('still deletes the row when reading the screenshot reference fails', async () => {
    mockReportMaybeSingle.mockResolvedValue({ data: null, error: { message: 'read failed' } })
    const res = await call()
    expect(res.status).toBe(200)
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'r1')
    expect(mockRemove).not.toHaveBeenCalled()
  })

  it('still deletes the row when the screenshot lookup throws', async () => {
    mockReportMaybeSingle.mockRejectedValue(new Error('network'))
    const res = await call()
    expect(res.status).toBe(200)
    expect(mockDeleteEq).toHaveBeenCalledWith('id', 'r1')
    expect(mockRemove).not.toHaveBeenCalled()
    expect(errorSpy).toHaveBeenCalled()
  })

  it('500 when the row delete fails, and keeps the screenshot', async () => {
    mockDeleteEq.mockResolvedValue({ error: { message: 'db down' } })
    const res = await call()
    expect(res.status).toBe(500)
    expect(mockRemove).not.toHaveBeenCalled()
  })
})
