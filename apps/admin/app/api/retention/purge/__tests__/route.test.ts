import { describe, it, expect, vi, beforeEach } from 'vitest'

const serviceClient = { tag: 'service' }
vi.mock('@iskotify/utils', () => ({ createServerClient: vi.fn(() => serviceClient) }))

const mockPurge = vi.fn()
vi.mock('@/lib/retention/purge', () => ({ purgeExpired: (...a: unknown[]) => mockPurge(...a) }))

function req(authorization?: string) {
  return new Request('http://localhost/api/retention/purge', {
    headers: authorization ? { authorization } : {},
  }) as unknown as import('next/server').NextRequest
}

describe('/api/retention/purge', () => {
  beforeEach(() => {
    vi.resetModules()
    mockPurge.mockReset()
    mockPurge.mockResolvedValue({ deleted: { app_feedback: 1 } })
    vi.stubEnv('CRON_SECRET', 'cron-secret-value')
  })

  it('rejects a request without the cron secret', async () => {
    const { GET } = await import('../route')
    expect((await GET(req())).status).toBe(401)
    expect((await GET(req('Bearer nope'))).status).toBe(401)
    expect(mockPurge).not.toHaveBeenCalled()
  })

  it('runs the purge for the Vercel cron with the service client', async () => {
    const { GET } = await import('../route')
    const res = await GET(req('Bearer cron-secret-value'))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ deleted: { app_feedback: 1 } })
    expect(mockPurge).toHaveBeenCalledWith(serviceClient, expect.any(Date))
  })

  it('reports a failure as 500', async () => {
    mockPurge.mockRejectedValue(new Error('screenshot removal failed'))
    const { GET } = await import('../route')
    expect((await GET(req('Bearer cron-secret-value'))).status).toBe(500)
  })
})
