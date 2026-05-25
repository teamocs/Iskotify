import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('next/navigation', () => ({
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`) },
}))

describe('SubjectCardsRedirect', () => {
  beforeEach(() => vi.resetModules())

  it('redirects to subjects/[id] with no query param', async () => {
    const { default: Page } = await import('../page')
    await expect(
      Page({ params: Promise.resolve({ id: 'sub1' }), searchParams: Promise.resolve({}) })
    ).rejects.toThrow('REDIRECT:/admin/flashcards/subjects/sub1')
  })

  it('preserves topic query param in redirect', async () => {
    const { default: Page } = await import('../page')
    await expect(
      Page({ params: Promise.resolve({ id: 'sub1' }), searchParams: Promise.resolve({ topic: 'topic-abc' }) })
    ).rejects.toThrow('REDIRECT:/admin/flashcards/subjects/sub1?topic=topic-abc')
  })
})
