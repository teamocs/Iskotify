import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/sync',
  useSearchParams: () => new URLSearchParams(''),
}))

import { DriveBlogCard, type BlogPreview, type LivePostRow } from '../DriveBlogCard'

const preview = (p: Partial<BlogPreview> = {}): BlogPreview => ({
  id: '7c1e3f0a-1b2c-4d5e-8f90-0123456789ab', drive_file_id: 'post-1', file_name: 'Iskotify — 25 Review Books', action: 'new',
  created_at: '2026-10-28T00:00:00Z', flags: [],
  post: {
    title: 'Which UPCAT Review Books Are Actually Worth Buying?', metaTitle: 'Best UPCAT Reviewer Book', metaDescription: 'What each book is for.',
    slug: 'best-upcat-reviewer-book', bodyMd: 'one two three four', faq: [], authorName: 'Bryden Basil C. Elizan', authorBio: null,
  },
  ...p,
})
const live = (p: Partial<LivePostRow> = {}): LivePostRow => ({
  id: '8d2e3f0a-1b2c-4d5e-8f90-0123456789ab', slug: 'upcat-study-plan', title: 'UPCAT Study Plan', status: 'published',
  first_published_at: '2026-10-20T00:00:00Z', updated_at: '2026-10-20T00:00:00Z', ...p,
})
const render = (p: Partial<React.ComponentProps<typeof DriveBlogCard>> = {}) =>
  renderToStaticMarkup(React.createElement(DriveBlogCard, { previews: [], posts: [], files: [], ...p }))

describe('DriveBlogCard', () => {
  it('shows a preview with its title, future URL, meta description and word count', () => {
    const html = render({ previews: [preview()] })
    expect(html).toContain('id="drive-blog"')
    expect(html).toContain('Which UPCAT Review Books Are Actually Worth Buying?')
    expect(html).toContain('/blog/best-upcat-reviewer-book')
    expect(html).toContain('What each book is for.')
    expect(html).toContain('4 words')
    expect(html).toContain('New post')
    expect(html).toMatch(/>Publish</)
    expect(html).toMatch(/>Discard</)
  })

  it('lists flagged claims and keeps Publish disabled until they are confirmed', () => {
    const html = render({ previews: [preview({ flags: ['Says “no subscription” — check it against the ₱500 Full Access plan.'] })] })
    expect(html).toContain('Says “no subscription”')
    expect(html).toContain('I’ve checked these claims')
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>[^<]*Publish</)
  })

  it('lists live posts with a link and an Unpublish action', () => {
    const html = render({ posts: [live(), live({ id: 'x', slug: 'old-post', title: 'Old', status: 'unpublished' })] })
    expect(html).toContain('href="/blog/upcat-study-plan"')
    expect(html).toMatch(/>Unpublish</)
    expect(html).toMatch(/>Republish</)
  })

  it('says when nothing is waiting', () => {
    expect(render()).toContain('Nothing waiting to publish')
  })
})
