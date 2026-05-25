import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockSingle = vi.fn()

vi.mock('@iskotify/utils', () => ({
  createServerClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ single: mockSingle }),
      }),
    }),
  }),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND') },
  redirect: (url: string) => { throw new Error(`REDIRECT:${url}`) },
}))

describe('TopicRedirect', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('redirects to subjects/[id] for a valid topic', async () => {
    mockSingle.mockResolvedValue({ data: { subject_id: 'sub-xyz' } })
    const { default: Page } = await import('../page')
    await expect(
      Page({ params: Promise.resolve({ id: 'topic-1' }) })
    ).rejects.toThrow('REDIRECT:/admin/flashcards/subjects/sub-xyz')
  })

  it('calls notFound for a missing topic', async () => {
    mockSingle.mockResolvedValue({ data: null })
    const { default: Page } = await import('../page')
    await expect(
      Page({ params: Promise.resolve({ id: 'nonexistent' }) })
    ).rejects.toThrow('NOT_FOUND')
  })

  it('redirects to flashcards root for an orphaned topic (null subject_id)', async () => {
    mockSingle.mockResolvedValue({ data: { subject_id: null } })
    const { default: Page } = await import('../page')
    await expect(
      Page({ params: Promise.resolve({ id: 'orphan-topic' }) })
    ).rejects.toThrow('REDIRECT:/admin/flashcards')
  })
})
