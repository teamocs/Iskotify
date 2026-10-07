import { newsSources, isHttpUrl } from '../newsSources'

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
