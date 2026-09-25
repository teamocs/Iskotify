import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { apiRequest } from '../apiRequest'

describe('apiRequest', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    global.fetch = vi.fn()
  })

  afterEach(() => {
    global.fetch = originalFetch
  })

  it('returns ok:true with the parsed JSON body on a successful response', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: '1', name: 'Algebra' }),
    } as Response)

    const result = await apiRequest<{ id: string; name: string }>('/api/x', { method: 'POST' })

    expect(result).toEqual({ ok: true, data: { id: '1', name: 'Algebra' } })
  })

  it('returns ok:false with the server error message on a non-ok response', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ error: 'Name is required' }),
    } as Response)

    const result = await apiRequest('/api/x', { method: 'POST' })

    expect(result).toEqual({ ok: false, error: 'Name is required', status: 400 })
  })

  it('falls back to a generic status-coded message when the error body has no error field', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => ({}),
    } as Response)

    const result = await apiRequest('/api/x')

    expect(result).toEqual({ ok: false, error: 'Request failed (500)', status: 500 })
  })

  it('falls back to a generic status-coded message when the body is not valid JSON', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => { throw new Error('Unexpected end of JSON input') },
    } as unknown as Response)

    const result = await apiRequest('/api/x')

    expect(result).toEqual({ ok: false, error: 'Request failed (502)', status: 502 })
  })

  it('treats an empty (unparsable) body on a successful response as null data, not a failure', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      status: 204,
      json: async () => { throw new Error('Unexpected end of JSON input') },
    } as unknown as Response)

    const result = await apiRequest('/api/x', { method: 'DELETE' })

    expect(result).toEqual({ ok: true, data: null })
  })

  it('returns ok:false with a network-error message when fetch itself throws', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new TypeError('Failed to fetch'))

    const result = await apiRequest('/api/x')

    expect(result).toEqual({ ok: false, error: 'Network error' })
  })

  it('never throws, even when fetch rejects', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new Error('boom'))
    await expect(apiRequest('/api/x')).resolves.toMatchObject({ ok: false })
  })
})
