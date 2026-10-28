import { describe, it, expect, vi } from 'vitest'

const mockList = vi.fn()
vi.mock('@/lib/blog/posts', () => ({ listPublishedPosts: () => mockList() }))

import robots from '../robots'
import sitemap from '../sitemap'

describe('robots.txt', () => {
  it('lets crawlers in but keeps them out of the console, API and login', () => {
    const r = robots()
    const rule = Array.isArray(r.rules) ? r.rules[0]! : r.rules
    expect(rule.userAgent).toBe('*')
    expect(rule.allow).toBe('/')
    expect(rule.disallow).toEqual(['/admin', '/api', '/login'])
    expect(r.sitemap).toBe('https://iskotify.ph/sitemap.xml')
  })
})

describe('sitemap.xml', () => {
  it('lists the public pages and every published blog post, on iskotify.ph', async () => {
    mockList.mockResolvedValue([{ slug: 'upcat-study-plan', updated_at: '2026-10-29T00:00:00Z' }])
    const entries = await sitemap()
    expect(entries.map(e => e.url)).toEqual([
      'https://iskotify.ph/',
      'https://iskotify.ph/listings',
      'https://iskotify.ph/blog',
      'https://iskotify.ph/contact',
      'https://iskotify.ph/privacy',
      'https://iskotify.ph/terms',
      'https://iskotify.ph/delete-account',
      'https://iskotify.ph/blog/upcat-study-plan',
    ])
    expect(entries.at(-1)).toMatchObject({ lastModified: '2026-10-29T00:00:00Z' })
  })

  it('still lists the pages when the blog cannot be read', async () => {
    mockList.mockRejectedValue(new Error('db down'))
    expect((await sitemap()).map(e => e.url)).toContain('https://iskotify.ph/blog')
  })
})
