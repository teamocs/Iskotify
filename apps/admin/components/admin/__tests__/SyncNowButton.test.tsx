import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'

vi.mock('@/app/admin/actions', () => ({ triggerSync: vi.fn() }))

import { SyncNowButton } from '../SyncNowButton'

describe('SyncNowButton', () => {
  it('renders the "Sync Now" label, not disabled in the initial state', () => {
    const html = renderToStaticMarkup(React.createElement(SyncNowButton))
    expect(html).toContain('Sync Now')
    expect(html).not.toContain('disabled=""')
    expect(html).not.toContain(' disabled>')
  })

  it('does not render a hand-rolled toast element before any sync has run', () => {
    // Regression: this component used to render its own absolutely-positioned
    // toast <div> instead of using the shared lib/toast — assert there's no
    // stray notice markup on first render.
    const html = renderToStaticMarkup(React.createElement(SyncNowButton))
    expect(html).not.toContain('Synced')
    expect(html).not.toContain('Skipped')
  })
})
