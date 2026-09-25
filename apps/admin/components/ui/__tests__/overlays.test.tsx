import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { Dialog } from '../Dialog'
import { Drawer } from '../Drawer'

const noop = () => {}

describe('Dialog', () => {
  it('renders nothing while closed', () => {
    expect(renderToStaticMarkup(<Dialog open={false} onClose={noop} title="Shortcuts">x</Dialog>)).toBe('')
  })

  it('is a labelled, described modal dialog when open', () => {
    const html = renderToStaticMarkup(
      <Dialog open onClose={noop} title="Keyboard shortcuts" description="Work without the mouse.">body</Dialog>,
    )
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    const labelledby = html.match(/aria-labelledby="([^"]+)"/)![1]
    const describedby = html.match(/aria-describedby="([^"]+)"/)![1]
    expect(html).toMatch(new RegExp(`id="${labelledby}"[^>]*>Keyboard shortcuts<`))
    expect(html).toMatch(new RegExp(`id="${describedby}"[^>]*>Work without the mouse.<`))
  })

  it('has a named close button', () => {
    const html = renderToStaticMarkup(<Dialog open onClose={noop} title="T">b</Dialog>)
    expect(html).toContain('aria-label="Close"')
  })

  it('can be an alertdialog for destructive confirmations', () => {
    expect(renderToStaticMarkup(<Dialog open onClose={noop} title="Delete?" role="alertdialog">b</Dialog>)).toContain('role="alertdialog"')
  })

  it('hides the scrim from assistive tech', () => {
    expect(renderToStaticMarkup(<Dialog open onClose={noop} title="T">b</Dialog>)).toMatch(/<div[^>]*aria-hidden="true"[^>]*bg-scrim|<div[^>]*bg-scrim[^>]*aria-hidden="true"/)
  })
})

describe('Drawer', () => {
  it('renders nothing while closed', () => {
    expect(renderToStaticMarkup(<Drawer open={false} onClose={noop} title="Edit listing">x</Drawer>)).toBe('')
  })

  it('is a labelled modal dialog anchored to the side when open', () => {
    const html = renderToStaticMarkup(
      <Drawer open onClose={noop} title="Edit listing" footer={<button type="button">Save</button>}>fields</Drawer>,
    )
    expect(html).toContain('role="dialog"')
    expect(html).toContain('aria-modal="true"')
    expect(html).toMatch(/aria-labelledby="([^"]+)"/)
    expect(html).toContain('Edit listing')
    expect(html).toContain('aria-label="Close"')
    expect(html).toContain('Save')
  })
})
