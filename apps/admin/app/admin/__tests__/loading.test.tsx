import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ListingsLoading from '../listings/loading'
import SyncLoading from '../sync/loading'
import FlashcardsLoading from '../flashcards/loading'
import SubjectLoading from '../flashcards/subjects/[id]/loading'
import CardsLoading from '../flashcards/subjects/[id]/cards/loading'
describe('loading skeletons', () => {
  it('ListingsLoading renders topbar + 4 stat cards + table', () => {
    const html = renderToStaticMarkup(<ListingsLoading />)
    expect(html).toContain('animate-pulse')
    expect(html).toContain('h-[52px]')
  })

  it('SyncLoading renders topbar + log bars', () => {
    const html = renderToStaticMarkup(<SyncLoading />)
    expect(html).toContain('animate-pulse')
    expect(html).toContain('h-[52px]')
  })

  it('FlashcardsLoading renders topbar + table skeleton', () => {
    const html = renderToStaticMarkup(<FlashcardsLoading />)
    expect(html).toContain('animate-pulse')
    expect(html).toContain('h-[52px]')
  })

  it('SubjectLoading renders topbar + row bars', () => {
    const html = renderToStaticMarkup(<SubjectLoading />)
    expect(html).toContain('animate-pulse')
    expect(html).toContain('h-[52px]')
  })

  it('CardsLoading renders topbar + accordion bars', () => {
    const html = renderToStaticMarkup(<CardsLoading />)
    expect(html).toContain('animate-pulse')
    expect(html).toContain('h-[52px]')
  })
})
