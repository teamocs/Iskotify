import { describe, it, expect } from 'vitest'
import { toSourceLinks, sourceUrls } from '../sources'

describe('toSourceLinks', () => {
  it('turns URLs into {label, url} links labelled by host (the shape the app reads)', () => {
    expect(toSourceLinks(['https://www.pup.edu.ph/iapply', 'http://upcat.up.edu.ph/results'])).toEqual([
      { label: 'pup.edu.ph', url: 'https://www.pup.edu.ph/iapply' },
      { label: 'upcat.up.edu.ph', url: 'http://upcat.up.edu.ph/results' },
    ])
  })

  it('keeps existing links, filling a missing label', () => {
    expect(toSourceLinks([{ url: 'https://a.example.com/x', label: 'Official post' }, { url: 'https://www.b.example.com' }])).toEqual([
      { label: 'Official post', url: 'https://a.example.com/x' },
      { label: 'b.example.com', url: 'https://www.b.example.com' },
    ])
  })

  it('drops anything that is not an http(s) URL, blanks and duplicates', () => {
    expect(toSourceLinks(['javascript:alert(1)', 'ftp://x.example.com', 'not a url', '', '  ', { url: 'data:text/html,hi' }, 42, null, 'https://a.example.com', 'https://a.example.com'])).toEqual([
      { label: 'a.example.com', url: 'https://a.example.com' },
    ])
  })

  it('accepts newline-separated text (the admin form) and non-arrays safely', () => {
    expect(toSourceLinks('https://a.example.com\n\nhttps://b.example.com ')).toHaveLength(2)
    expect(toSourceLinks(undefined)).toEqual([])
    expect(toSourceLinks({ url: 'https://a.example.com' })).toEqual([])
  })

  it('caps the list', () => {
    expect(toSourceLinks(Array.from({ length: 30 }, (_, i) => `https://s${i}.example.com`))).toHaveLength(10)
  })
})

describe('sourceUrls', () => {
  it('reads URLs from either shape', () => {
    expect(sourceUrls(['https://a.example.com', { url: 'https://b.example.com', label: 'B' }, { nope: 1 }, 3])).toEqual(['https://a.example.com', 'https://b.example.com'])
    expect(sourceUrls(null)).toEqual([])
  })
})
