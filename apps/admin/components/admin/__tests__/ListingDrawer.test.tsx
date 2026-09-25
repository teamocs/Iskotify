import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), replace: vi.fn() }),
}))

import { ListingDrawer, validateListingForm } from '../ListingDrawer'

const render = () => renderToStaticMarkup(<ListingDrawer listing={null} onClose={vi.fn()} />)

describe('ListingDrawer', () => {
  it('is a real form with a submit button in the footer so Enter submits', () => {
    const html = render()
    expect(html).toMatch(/<form[^>]*novalidate/i)
    expect(html).toMatch(/<button type="submit"[^>]*>[\s\S]*Create listing<\/button>[\s\S]*<\/form>/)
    expect(html).toContain('>Cancel</button>')
  })

  it('labels Type and Status with real labels and no duplicate aria-label', () => {
    const html = render()
    for (const name of ['Type', 'Status', 'Scope']) {
      const m = html.match(new RegExp(`<label for="([^"]+)"[^>]*>${name}<`))
      expect(m, name).not.toBeNull()
      expect(html).toMatch(new RegExp(`<select[^>]*id="${m![1]}"`))
    }
    expect(html).not.toContain('aria-label="Type"')
    expect(html).not.toContain('aria-label="Status"')
  })

  it('wires every text label to a control', () => {
    const html = render()
    const labels = [...html.matchAll(/<label for="([^"]+)"/g)]
    expect(labels.length).toBeGreaterThan(15)
    for (const [, id] of labels) expect(html).toContain(`id="${id}"`)
    expect(html).not.toMatch(/<label class/)
  })

  it('marks the fields the server requires', () => {
    const html = render()
    // type, status, title, slug, provider, region
    expect(html.match(/ required=""/g)?.length).toBe(6)
  })

  it('uses tokens only (no raw colours, no 10px text)', () => {
    const html = render()
    expect(html).not.toMatch(/bg-white|bg-black|text-white|text-\[1[01]px\]|\[#/)
  })
})

describe('validateListingForm', () => {
  it('flags each missing required field', () => {
    const e = validateListingForm({ type: 'scholarship', status: 'active', title: '', slug: '', provider: '', region: '' })
    expect(Object.keys(e).sort()).toEqual(['provider', 'region', 'slug', 'title'])
  })
  it('passes a complete form', () => {
    expect(validateListingForm({ type: 'exam', status: 'active', title: 'T', slug: 's', provider: 'P', region: 'R' })).toEqual({})
  })
})
