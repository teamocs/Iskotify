import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { saveCourseTags } from '../courseTagsApi'

describe('saveCourseTags', () => {
  const originalFetch = global.fetch
  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { global.fetch = originalFetch })

  it('PATCHes the listing id and target_courses', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response)
    const result = await saveCourseTags('l1', ['Engineering & Technology'])
    expect(global.fetch).toHaveBeenCalledWith('/api/admin/listings', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ id: 'l1', target_courses: ['Engineering & Technology'] }),
    }))
    expect(result).toEqual({ ok: true })
  })

  it('resolves ok:false instead of throwing on a network failure', async () => {
    vi.mocked(global.fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    await expect(saveCourseTags('l1', ['all'])).resolves.toEqual({ ok: false, error: 'Network error' })
  })

  it('resolves ok:false with the server message on a non-ok response', async () => {
    vi.mocked(global.fetch).mockResolvedValue({ ok: false, status: 403, json: async () => ({ error: 'Forbidden' }) } as Response)
    await expect(saveCourseTags('l1', ['all'])).resolves.toEqual({ ok: false, error: 'Forbidden' })
  })
})
