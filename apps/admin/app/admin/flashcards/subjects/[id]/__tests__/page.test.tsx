import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const mockSingle = vi.fn()
const mockOrder = vi.fn()

vi.mock('@iskotify/utils', () => ({
  createServerClient: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () =>
          table === 'flashcard_subjects'
            ? { single: mockSingle }
            : { order: mockOrder },
      }),
    }),
  }),
}))

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND') },
}))

vi.mock('@/components/admin/Topbar', () => ({
  Topbar: ({ title }: { title: string }) => <div data-testid="topbar">{title}</div>,
}))

vi.mock('@/components/admin/Breadcrumb', () => ({
  Breadcrumb: () => <nav data-testid="breadcrumb" />,
}))

vi.mock('@/components/admin/AddTopicButton', () => ({
  AddTopicButton: () => <button>+ Add Topic</button>,
}))

vi.mock('@/components/admin/SubjectCardsView', () => ({
  SubjectCardsView: ({ topics }: { topics: { name: string }[] }) => (
    <div data-testid="subject-cards-view">
      {topics.map(t => <span key={t.name}>{t.name}</span>)}
    </div>
  ),
}))

describe('SubjectDetailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('renders SubjectCardsView with topics', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'sub1', name: 'Mathematics' } })
    mockOrder.mockResolvedValue({
      data: [
        { id: 't1', name: 'Algebra', status: 'published', flashcards: [{ id: 'c1' }, { id: 'c2' }] },
        { id: 't2', name: 'Geometry', status: 'draft', flashcards: [] },
      ],
    })

    const { default: Page } = await import('../page')
    const element = await Page({ params: Promise.resolve({ id: 'sub1' }) })
    const html = renderToStaticMarkup(element as React.ReactElement)

    expect(html).toContain('subject-cards-view')
    expect(html).toContain('Algebra')
    expect(html).toContain('Geometry')
    expect(html).toContain('Mathematics')
    expect(html).toContain('2 topics')
  })

  it('does not render the old View Cards link', async () => {
    mockSingle.mockResolvedValue({ data: { id: 'sub1', name: 'Mathematics' } })
    mockOrder.mockResolvedValue({
      data: [
        { id: 't1', name: 'Algebra', status: 'published', flashcards: [] },
      ],
    })

    const { default: Page } = await import('../page')
    const element = await Page({ params: Promise.resolve({ id: 'sub1' }) })
    const html = renderToStaticMarkup(element as React.ReactElement)

    expect(html).not.toContain('View Cards')
    expect(html).not.toContain('Actions')
  })

  it('calls notFound when subject does not exist', async () => {
    mockSingle.mockResolvedValue({ data: null })
    mockOrder.mockResolvedValue({ data: [] })

    const { default: Page } = await import('../page')
    await expect(
      Page({ params: Promise.resolve({ id: 'nonexistent' }) })
    ).rejects.toThrow('NOT_FOUND')
  })
})
