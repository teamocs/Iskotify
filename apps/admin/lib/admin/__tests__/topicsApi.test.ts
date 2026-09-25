import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renameTopic, deleteTopic, updateCard, deleteCard } from '../topicsApi'

describe('topicsApi', () => {
  const originalFetch = global.fetch
  beforeEach(() => { global.fetch = vi.fn() })
  afterEach(() => { global.fetch = originalFetch })

  describe('renameTopic', () => {
    it('patches the topic name', async () => {
      vi.mocked(global.fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response)
      const result = await renameTopic('t1', 'Algebra II')
      expect(global.fetch).toHaveBeenCalledWith('/api/flashcards/topics/t1', expect.objectContaining({ method: 'PATCH' }))
      expect(result).toEqual({ ok: true })
    })

    it('resolves ok:false instead of throwing on a network failure', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('boom'))
      await expect(renameTopic('t1', 'Algebra II')).resolves.toEqual({ ok: false, error: 'Network error' })
    })
  })

  describe('deleteTopic', () => {
    it('resolves ok:false with the server message on a non-ok response', async () => {
      vi.mocked(global.fetch).mockResolvedValue({
        ok: false, status: 400, json: async () => ({ error: 'Topic has cards' }),
      } as Response)
      await expect(deleteTopic('t1')).resolves.toEqual({ ok: false, error: 'Topic has cards' })
    })
  })

  describe('updateCard', () => {
    it('patches question/answer/explanation', async () => {
      vi.mocked(global.fetch).mockResolvedValue({ ok: true, status: 200, json: async () => ({}) } as Response)
      const result = await updateCard('c1', { question: 'Q', answer: 'A', explanation: null })
      expect(global.fetch).toHaveBeenCalledWith('/api/flashcards/cards/c1', expect.objectContaining({ method: 'PATCH' }))
      expect(result).toEqual({ ok: true })
    })

    it('resolves ok:false instead of throwing on a network failure', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('boom'))
      await expect(updateCard('c1', { question: 'Q', answer: 'A', explanation: null })).resolves.toEqual({ ok: false, error: 'Network error' })
    })
  })

  describe('deleteCard', () => {
    it('resolves ok:false instead of throwing on a network failure', async () => {
      vi.mocked(global.fetch).mockRejectedValue(new Error('boom'))
      await expect(deleteCard('c1')).resolves.toEqual({ ok: false, error: 'Network error' })
    })
  })
})
