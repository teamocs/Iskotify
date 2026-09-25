import { describe, it, expect } from 'vitest'
import { NAV_GROUPS, HOME_ITEM, findActiveHref, allNavHrefs, GO_SHORTCUTS } from '../adminNav'

describe('NAV_GROUPS', () => {
  it('has exactly the five jobs, in order', () => {
    expect(NAV_GROUPS.map(g => g.label)).toEqual(['Content', 'Listings', 'Inbox', 'Audience', 'System'])
  })

  it('puts the right destinations in each group', () => {
    const labels = Object.fromEntries(NAV_GROUPS.map(g => [g.label, g.items.map(i => i.label)]))
    expect(labels).toEqual({
      Content: ['Knowledge base', 'Import questions', 'Drafts', 'Review queue', 'Exam blueprints', 'Drive question bank'],
      Listings: ['All listings', 'Course tags', 'Admissions updates'],
      Inbox: ['Reported questions', 'Bug reports', 'Feedback', 'Date corrections'],
      Audience: ['Users', 'Early access', 'Analytics'],
      System: ['Sync logs', 'Data tables', 'User guide'],
    })
  })

  it('no longer links raw data tables from the sidebar — only the index', () => {
    const hrefs = allNavHrefs()
    expect(hrefs.filter(h => h.startsWith('/admin/data/'))).toEqual([])
    expect(hrefs).toContain('/admin/data')
  })

  it('has no duplicate destinations or labels', () => {
    const hrefs = allNavHrefs()
    expect(new Set(hrefs).size).toBe(hrefs.length)
    const labels = NAV_GROUPS.flatMap(g => g.items.map(i => i.label))
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('every item names a drawn icon, never an emoji', () => {
    for (const item of [HOME_ITEM, ...NAV_GROUPS.flatMap(g => g.items)]) {
      expect(item.icon).toMatch(/^[a-z-]+$/)
    }
  })
})

describe('findActiveHref', () => {
  const hrefs = allNavHrefs()

  it('matches Home only on the exact root', () => {
    expect(findActiveHref('/admin', hrefs)).toBe('/admin')
    expect(findActiveHref('/admin/nowhere', hrefs)).toBeNull()
  })

  it('matches nested pages by prefix', () => {
    expect(findActiveHref('/admin/flashcards/subjects/abc', hrefs)).toBe('/admin/flashcards')
    expect(findActiveHref('/admin/exam-blueprints/upcat-2027', hrefs)).toBe('/admin/exam-blueprints')
    expect(findActiveHref('/admin/data/career_courses', hrefs)).toBe('/admin/data')
  })

  it('prefers the longest (most specific) prefix', () => {
    expect(findActiveHref('/admin/flashcards/drafts', hrefs)).toBe('/admin/flashcards/drafts')
    expect(findActiveHref('/admin/listings/courses', hrefs)).toBe('/admin/listings/courses')
    expect(findActiveHref('/admin/listings', hrefs)).toBe('/admin/listings')
  })

  it('respects segment boundaries', () => {
    expect(findActiveHref('/admin/listingsx', hrefs)).toBeNull()
  })

  it('prefers a plain link over an in-page anchor to the same route', () => {
    expect(findActiveHref('/admin/sync', hrefs)).toBe('/admin/sync')
  })

  it('tolerates a trailing slash', () => {
    expect(findActiveHref('/admin/users/', hrefs)).toBe('/admin/users')
  })
})

describe('GO_SHORTCUTS', () => {
  it('maps g h / g c / g i to home, content and inbox', () => {
    expect(GO_SHORTCUTS.h.href).toBe('/admin')
    expect(GO_SHORTCUTS.c.href).toBe(NAV_GROUPS[0]!.items[0]!.href)
    expect(GO_SHORTCUTS.i.href).toBe(NAV_GROUPS.find(g => g.label === 'Inbox')!.items[0]!.href)
  })
})
