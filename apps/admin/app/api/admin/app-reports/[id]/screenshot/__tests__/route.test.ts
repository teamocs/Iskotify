import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://fake.supabase.co')
vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'fake-service-key')

// ---- Auth gate (lib/admin/requireAdmin → createAuthClient + profiles.role) ----
const mockGetUser = vi.fn()
const mockRoleSingle = vi.fn()
vi.mock('@/lib/supabase', () => ({
  createAuthClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}))

// ---- Service-role client: profiles, app_bug_reports, storage ----
const mockReportMaybeSingle = vi.fn()
const mockReportEq = vi.fn(() => ({ maybeSingle: mockReportMaybeSingle }))
const mockCreateSignedUrl = vi.fn()
const mockStorageFrom = vi.fn(() => ({ createSignedUrl: mockCreateSignedUrl }))
const mockFrom = vi.fn((table: string) => {
  if (table === 'profiles') return { select: () => ({ eq: () => ({ single: mockRoleSingle }) }) }
  return { select: () => ({ eq: mockReportEq }) }
})
vi.mock('@iskotify/utils', () => ({
  createServerClient: vi.fn(() => ({ from: mockFrom, storage: { from: mockStorageFrom } })),
}))

import { GET } from '../route'

const call = (id = 'r1') =>
  GET(new NextRequest(`http://localhost/api/admin/app-reports/${id}/screenshot`), { params: Promise.resolve({ id }) })

beforeEach(() => {
  vi.clearAllMocks()
  mockGetUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } })
  mockRoleSingle.mockResolvedValue({ data: { role: 'admin' } })
  mockReportMaybeSingle.mockResolvedValue({ data: { image_url: '1727-ab.png' }, error: null })
  mockCreateSignedUrl.mockResolvedValue({ data: { signedUrl: 'https://fake.supabase.co/storage/v1/object/sign/app-bug-reports/1727-ab.png?token=t' }, error: null })
})

describe('GET /api/admin/app-reports/[id]/screenshot', () => {
  it('401 when signed out, and never touches storage', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } })
    const res = await call()
    expect(res.status).toBe(401)
    expect(mockStorageFrom).not.toHaveBeenCalled()
  })

  it('403 for a signed-in non-admin, and never touches storage', async () => {
    mockRoleSingle.mockResolvedValue({ data: { role: 'student' } })
    const res = await call()
    expect(res.status).toBe(403)
    expect(mockStorageFrom).not.toHaveBeenCalled()
  })

  it('returns a short-lived signed URL for the report’s screenshot', async () => {
    const res = await call('r1')
    expect(res.status).toBe(200)
    expect(mockReportEq).toHaveBeenCalledWith('id', 'r1')
    expect(mockStorageFrom).toHaveBeenCalledWith('app-bug-reports')
    const [path, ttl] = mockCreateSignedUrl.mock.calls[0] as [string, number]
    expect(path).toBe('1727-ab.png')
    expect(ttl).toBeGreaterThanOrEqual(300)
    expect(ttl).toBeLessThanOrEqual(600)
    const body = await res.json()
    expect(body.url).toContain('/object/sign/app-bug-reports/1727-ab.png')
    expect(body.expiresIn).toBe(ttl)
    expect(JSON.stringify(body)).not.toContain('fake-service-key')
    expect(res.headers.get('cache-control')).toBe('no-store')
  })

  it('signs the extracted path for an old row that stored a full public URL', async () => {
    mockReportMaybeSingle.mockResolvedValue({
      data: { image_url: 'https://fake.supabase.co/storage/v1/object/public/app-bug-reports/old-shot.png' },
      error: null,
    })
    const res = await call()
    expect(res.status).toBe(200)
    expect(mockCreateSignedUrl.mock.calls[0]?.[0]).toBe('old-shot.png')
  })

  it('404 when the report has no screenshot or does not exist', async () => {
    mockReportMaybeSingle.mockResolvedValue({ data: { image_url: null }, error: null })
    expect((await call()).status).toBe(404)
    mockReportMaybeSingle.mockResolvedValue({ data: null, error: null })
    expect((await call()).status).toBe(404)
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('404 when the stored value points outside the bug-report bucket', async () => {
    mockReportMaybeSingle.mockResolvedValue({ data: { image_url: 'https://evil.example.com/x.png' }, error: null })
    expect((await call()).status).toBe(404)
    expect(mockCreateSignedUrl).not.toHaveBeenCalled()
  })

  it('500 when signing fails', async () => {
    mockCreateSignedUrl.mockResolvedValue({ data: null, error: { message: 'Object not found' } })
    expect((await call()).status).toBe(500)
  })
})
