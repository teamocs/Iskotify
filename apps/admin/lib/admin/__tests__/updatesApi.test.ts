import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { saveUpdate, deleteUpdate } from '../updatesApi'

describe('updatesApi', () => {
  const originalFetch = global.fetch
  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { global.fetch = originalFetch })

  describe('saveUpdate', () => {
    it('POSTs a new update when there is no id in the payload', async () => {
      vi.mocked(global.fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'u1' }) } as Response)
      const result = await saveUpdate({ title: 'New update' })
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/updates', expect.objectContaining({ method: 'POST' }))
      expect(result).toEqual({ ok: true, data: { id: 'u1' } })
    })

    it('PATCHes when the payload has an id', async () => {
      vi.mocked(global.fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: 'u1' }) } as Response)
      await saveUpdate({ id: 'u1', title: 'Edited' })
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/updates', expect.objectContaining({ method: 'PATCH' }))
    })

    it('resolves ok:false instead of throwing when the network request fails — the caller previously had no try/catch at all', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new TypeError('Failed to fetch'))
      await expect(saveUpdate({ title: 'X' })).resolves.toEqual({ ok: false, error: 'Network error' })
    })
  })

  describe('deleteUpdate', () => {
    it('DELETEs by id in the query string', async () => {
      vi.mocked(global.fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response)
      const result = await deleteUpdate('u1')
      expect(global.fetch).toHaveBeenCalledWith('/api/admin/updates?id=u1', { method: 'DELETE' })
      expect(result).toEqual({ ok: true })
    })

    it('resolves ok:false instead of throwing when the network request fails', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('boom'))
      await expect(deleteUpdate('u1')).resolves.toEqual({ ok: false, error: 'Network error' })
    })
  })
})
