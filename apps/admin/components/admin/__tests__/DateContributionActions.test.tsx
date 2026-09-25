import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

import { DateContributionActions } from '../DateContributionActions'

describe('DateContributionActions', () => {
  it('renders labelled Approve and Reject buttons naming the listing', () => {
    const html = renderToStaticMarkup(<DateContributionActions id="c1" label="UPCAT 2027" />)
    expect(html).toMatch(/aria-label="Approve date correction for UPCAT 2027"[^>]*>[\s\S]*?Approve/)
    expect(html).toMatch(/aria-label="Reject date correction for UPCAT 2027"[^>]*>[\s\S]*?Reject/)
  })

  it('uses the design-system buttons, not raw colours', () => {
    const html = renderToStaticMarkup(<DateContributionActions id="c1" />)
    expect(html).not.toMatch(/bg-white|text-white|#fff8f8|rounded-\[/)
    expect(html).not.toContain('role="alert"')
  })
})
