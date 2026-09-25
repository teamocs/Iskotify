import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { deleteListing, saveListing } from '../listingsApi'

describe('deleteListing', () => {
  const originalFetch = global.fetch
  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { global.fetch = originalFetch })

  it('calls DELETE on the listing endpoint and resolves ok:true on success', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response)
    const result = await deleteListing('abc-123')
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/listings/abc-123', { method: 'DELETE' })
    expect(result).toEqual({ ok: true })
  })

  it('resolves ok:false with the server error message on a non-ok response (never silently succeeds)', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false, status: 403, json: async () => ({ error: 'Not allowed' }),
    } as Response)
    const result = await deleteListing('abc-123')
    expect(result).toEqual({ ok: false, error: 'Not allowed' })
  })

  it('resolves ok:false instead of throwing when the network request itself fails', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(deleteListing('abc-123')).resolves.toEqual({ ok: false, error: 'Network error' })
  })
})

describe('saveListing', () => {
  const originalFetch = global.fetch
  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { global.fetch = originalFetch })

  it('POSTs to the collection endpoint when there is no existing id', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'new-1' }) } as Response)
    const result = await saveListing({ title: 'New' }, undefined)
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/listings', expect.objectContaining({ method: 'POST' }))
    expect(result).toEqual({ ok: true, data: { id: 'new-1' } })
  })

  it('PATCHes the item endpoint when an existing id is given', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'l1' }) } as Response)
    await saveListing({ title: 'Updated' }, 'l1')
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/listings/l1', expect.objectContaining({ method: 'PATCH' }))
  })

  it('resolves ok:false instead of throwing when the network request itself fails', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(saveListing({ title: 'X' }, undefined)).resolves.toEqual({ ok: false, error: 'Network error' })
  })

  it('resolves ok:false with the server error message on a non-ok response', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: 'Bad slug' }) } as Response)
    await expect(saveListing({ title: 'X' }, undefined)).resolves.toEqual({ ok: false, error: 'Bad slug', status: 400 })
  })
})
