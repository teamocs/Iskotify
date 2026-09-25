import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND') },
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/admin/data/career_courses',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}))

import DataTablePage from '../page'

describe('DataTablePage', () => {
  it('has exactly one h1 (the Topbar title) and no repeated h2 title', async () => {
    const html = renderToStaticMarkup(await DataTablePage({ params: Promise.resolve({ table: 'career_courses' }) }))
    expect(html.match(/<h1/g)?.length).toBe(1)
    expect(html).toMatch(/<h1[^>]*>\s*Career Courses\s*<\/h1>/)
    expect(html).not.toContain('<h2')
  })

  it('introduces the table in one line with a link to the guide', async () => {
    const html = renderToStaticMarkup(await DataTablePage({ params: Promise.resolve({ table: 'career_courses' }) }))
    expect(html).toContain('href="/admin/guide#career_courses"')
  })

  it('404s for a table that is not allow-listed', async () => {
    await expect(DataTablePage({ params: Promise.resolve({ table: 'profiles' }) })).rejects.toThrow('NOT_FOUND')
  })
})
