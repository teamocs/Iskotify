import { newsSources, isHttpUrl, firstSourceHost } from '../newsSources'
import { buildNewsAndDatesFeed } from '../newsAndDatesFeed'

describe('firstSourceHost', () => {
  it('reads the stored JSON, a parsed list or a bare URL', () => {
    expect(firstSourceHost('[{"label":"DOST","url":"https://www.sei.dost.gov.ph/apply"}]')).toBe('sei.dost.gov.ph')
    expect(firstSourceHost(['https://up.edu.ph/upcat'])).toBe('up.edu.ph')
    expect(firstSourceHost('https://www.feu.edu.ph')).toBe('feu.edu.ph')
  })

  it('is null when there is no usable source (never made up)', () => {
    for (const raw of ['[]', '', 'not json', null, undefined, '["javascript:alert(1)"]']) {
      expect(firstSourceHost(raw)).toBeNull()
    }
  })

  it('reaches the Coming up feed only when the data has one', () => {
    const now = Date.UTC(2026, 9, 1)
    const feed = buildNewsAndDatesFeed({
      now,
      offsetMs: 0,
      noteReminders: [],
      admissionItems: [],
      focusedListings: [
        { slug: 'a', title: 'A', type: 'scholarship', examDate: null, deadline: now + 86_400_000, sourceUrl: 'https://sei.dost.gov.ph' },
        { slug: 'b', title: 'B', type: 'scholarship', examDate: null, deadline: now + 2 * 86_400_000, sourceUrl: '' },
      ],
    })
    expect(feed.map(e => e.sourceHost ?? null)).toEqual(['sei.dost.gov.ph', null])
  })
})

describe('newsSources', () => {
  it('keeps {label, url} links (what the admin console writes)', () => {
    expect(newsSources([{ label: 'pup.edu.ph', url: 'https://www.pup.edu.ph/iapply' }])).toEqual([
      { label: 'pup.edu.ph', url: 'https://www.pup.edu.ph/iapply' },
    ])
  })

  it('accepts plain URL strings (older rows), labelled by host', () => {
    expect(newsSources(['https://www.up.edu.ph/upcat', 'http://feu.edu.ph'])).toEqual([
      { label: 'up.edu.ph', url: 'https://www.up.edu.ph/upcat' },
      { label: 'feu.edu.ph', url: 'http://feu.edu.ph' },
    ])
  })

  it('drops anything that is not an http(s) URL', () => {
    expect(newsSources([
      'javascript:alert(1)',
      { url: 'intent://evil#Intent;end' },
      { url: 'tel:123' },
      'not a url',
      '',
      null,
      42,
      { label: 'no url' },
    ])).toEqual([])
  })

  it('is empty for a non-list', () => {
    expect(newsSources(undefined)).toEqual([])
    expect(newsSources('https://a.example.com')).toEqual([])
  })
})

describe('isHttpUrl', () => {
  it('only allows http and https', () => {
    expect(isHttpUrl('https://a.example.com/x')).toBe(true)
    expect(isHttpUrl('HTTP://A.EXAMPLE.COM')).toBe(true)
    expect(isHttpUrl('javascript:alert(1)')).toBe(false)
    expect(isHttpUrl('https://')).toBe(false)
    expect(isHttpUrl(' https://a.example.com')).toBe(false)
  })
})
