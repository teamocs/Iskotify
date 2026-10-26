import { describe, it, expect } from 'vitest'
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
  it('lists only the public pages, on iskotify.ph', () => {
    const urls = sitemap().map(e => e.url)
    expect(urls).toEqual([
      'https://iskotify.ph/',
      'https://iskotify.ph/listings',
      'https://iskotify.ph/contact',
      'https://iskotify.ph/privacy',
      'https://iskotify.ph/terms',
      'https://iskotify.ph/delete-account',
    ])
  })
})
