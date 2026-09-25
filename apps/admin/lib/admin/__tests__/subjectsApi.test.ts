import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createSubject, updateSubject, deleteSubject } from '../subjectsApi'

describe('subjectsApi', () => {
  const originalFetch = global.fetch
  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { global.fetch = originalFetch })

  describe('createSubject', () => {
    it('posts the trimmed name and slugs, resolving ok:true with the created subject', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true, status: 200, json: async () => ({ id: 's1', name: 'Biology', listing_slugs: ['x'] }),
      } as Response)
      const result = await createSubject('Biology', ['x'])
      expect(global.fetch).toHaveBeenCalledWith('/api/flashcards/subjects', expect.objectContaining({ method: 'POST' }))
      expect(result).toEqual({ ok: true, data: { id: 's1', name: 'Biology', listing_slugs: ['x'] } })
    })

    it('never throws when the network request fails — resolves ok:false instead', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new TypeError('Failed to fetch'))
      await expect(createSubject('Biology', [])).resolves.toEqual({ ok: false, error: 'Network error' })
    })
  })

  describe('updateSubject', () => {
    it('patches the given subject id', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: true, status: 200, json: async () => ({ id: 's1', name: 'Math', listing_slugs: [] }),
      } as Response)
      const result = await updateSubject('s1', 'Math', [])
      expect(global.fetch).toHaveBeenCalledWith('/api/flashcards/subjects/s1', expect.objectContaining({ method: 'PATCH' }))
      expect(result.ok).toBe(true)
    })

    it('resolves ok:false instead of throwing on a network failure', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('boom'))
      await expect(updateSubject('s1', 'Math', [])).resolves.toEqual({ ok: false, error: 'Network error' })
    })
  })

  describe('deleteSubject', () => {
    it('resolves ok:false with the server message on a non-ok response', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false, status: 409, json: async () => ({ error: 'Subject has cards' }),
      } as Response)
      await expect(deleteSubject('s1')).resolves.toEqual({ ok: false, error: 'Subject has cards' })
    })

    it('resolves ok:false instead of throwing on a network failure', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('boom'))
      await expect(deleteSubject('s1')).resolves.toEqual({ ok: false, error: 'Network error' })
    })
  })
})
