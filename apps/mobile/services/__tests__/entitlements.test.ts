/**
 * P3 Full Access: reading the server entitlement row and asking the admin host
 * for a PayMongo checkout (web purchase path).
 */
import { fetchEntitlementPremium, requestCheckout, CHECKOUT_URL } from '../entitlements'

const mockQuery: { data: unknown; error: unknown; table: string | null; filter: [string, unknown] | null } = {
  data: null, error: null, table: null, filter: null,
}
const mockSession: { token: string | null } = { token: 'tok' }

jest.mock('../supabase', () => ({
  supabase: {
    auth: {
      getSession: jest.fn(async () => ({ data: { session: mockSession.token ? { access_token: mockSession.token } : null } })),
    },
    from: jest.fn((table: string) => {
      mockQuery.table = table
      return {
        select: () => ({
          eq: (col: string, val: unknown) => {
            mockQuery.filter = [col, val]
            return { maybeSingle: async () => ({ data: mockQuery.data, error: mockQuery.error }) }
          },
        }),
      }
    }),
  },
}))

const fetchMock = jest.fn()
beforeEach(() => {
  Object.assign(mockQuery, { data: null, error: null, table: null, filter: null })
  mockSession.token = 'tok'
  fetchMock.mockReset()
  ;(global as unknown as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch
  jest.spyOn(console, 'warn').mockImplementation(() => {})
})

describe('fetchEntitlementPremium', () => {
  it("reads only the student's own row", async () => {
    mockQuery.data = { premium: true, revoked_at: null }
    expect(await fetchEntitlementPremium('u1')).toBe(true)
    expect(mockQuery.table).toBe('entitlements')
    expect(mockQuery.filter).toEqual(['user_id', 'u1'])
  })

  it('is false with no row, with premium off, or when revoked', async () => {
    expect(await fetchEntitlementPremium('u1')).toBe(false)
    mockQuery.data = { premium: false, revoked_at: null }
    expect(await fetchEntitlementPremium('u1')).toBe(false)
    mockQuery.data = { premium: true, revoked_at: '2026-10-01T00:00:00Z' }
    expect(await fetchEntitlementPremium('u1')).toBe(false)
  })

  it('is null (unknown) when the row cannot be read, so the cache stands', async () => {
    mockQuery.error = { message: 'offline' }
    expect(await fetchEntitlementPremium('u1')).toBeNull()
  })
})

describe('requestCheckout', () => {
  const json = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body })

  it('posts with the access token and returns the checkout link', async () => {
    fetchMock.mockResolvedValue(json(200, { checkoutUrl: 'https://checkout.paymongo.com/cs_1' }))
    expect(await requestCheckout()).toEqual({ ok: true, checkoutUrl: 'https://checkout.paymongo.com/cs_1' })
    expect(fetchMock).toHaveBeenCalledWith(CHECKOUT_URL, expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ Authorization: 'Bearer tok' }),
    }))
    expect(CHECKOUT_URL).toMatch(/\/api\/payments\/checkout$/)
  })

  it('needs a signed-in account', async () => {
    mockSession.token = null
    expect(await requestCheckout()).toEqual({ ok: false, reason: 'signed_out' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('maps the agreed server answers', async () => {
    fetchMock.mockResolvedValueOnce(json(409, { error: 'already_premium' }))
    expect(await requestCheckout()).toEqual({ ok: false, reason: 'already_premium' })
    fetchMock.mockResolvedValueOnce(json(503, { error: 'payments_disabled' }))
    expect(await requestCheckout()).toEqual({ ok: false, reason: 'payments_disabled' })
    fetchMock.mockResolvedValueOnce(json(401, { error: 'unauthorized' }))
    expect(await requestCheckout()).toEqual({ ok: false, reason: 'signed_out' })
    fetchMock.mockResolvedValueOnce(json(500, {}))
    expect(await requestCheckout()).toEqual({ ok: false, reason: 'error' })
  })

  it('refuses a checkout link that is not https', async () => {
    fetchMock.mockResolvedValue(json(200, { checkoutUrl: 'javascript:alert(1)' }))
    expect(await requestCheckout()).toEqual({ ok: false, reason: 'error' })
  })

  it('reports a network failure', async () => {
    fetchMock.mockRejectedValue(new Error('offline'))
    expect(await requestCheckout()).toEqual({ ok: false, reason: 'network' })
  })
})
