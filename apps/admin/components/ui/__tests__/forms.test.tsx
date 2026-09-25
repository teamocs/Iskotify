import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { Dialog } from '../Dialog'
import { Drawer, DiscardChangesDialog, closeOrConfirm } from '../Drawer'
import { PageBody } from '../Page'

const noop = () => {}

describe('Drawer as a form', () => {
  it('wraps body and footer in a real form when onSubmit is given, so Enter submits', () => {
    const html = renderToStaticMarkup(
      <Drawer open onClose={noop} title="Edit card" onSubmit={noop} footer={<button type="submit">Save</button>}>
        <input id="q" />
      </Drawer>,
    )
    expect(html).toMatch(/<form[^>]*>[\s\S]*<input id="q"\/>[\s\S]*<button type="submit">Save<\/button>[\s\S]*<\/form>/)
  })

  it('stays a plain panel without onSubmit', () => {
    const html = renderToStaticMarkup(<Drawer open onClose={noop} title="View">x</Drawer>)
    expect(html).not.toContain('<form')
  })

  it('passes a guarded close to a footer render function', () => {
    const html = renderToStaticMarkup(
      <Drawer open onClose={noop} title="Edit" footer={close => <button type="button" onClick={close}>Cancel</button>}>x</Drawer>,
    )
    expect(html).toContain('>Cancel</button>')
  })
})

describe('Dialog as a form', () => {
  it('wraps content in a form when onSubmit is given', () => {
    const html = renderToStaticMarkup(
      <Dialog open onClose={noop} title="Add topic" onSubmit={noop} footer={<button type="submit">Add</button>}>
        <input id="n" />
      </Dialog>,
    )
    expect(html).toMatch(/<form[^>]*>[\s\S]*<input id="n"\/>[\s\S]*<button type="submit">Add<\/button>[\s\S]*<\/form>/)
  })
})

describe('unsaved-changes guard', () => {
  it('closes straight away when nothing changed', () => {
    let closed = false
    let asked = false
    closeOrConfirm(false, () => { closed = true }, () => { asked = true })
    expect(closed).toBe(true)
    expect(asked).toBe(false)
  })

  it('asks before discarding when the form is dirty', () => {
    let closed = false
    let asked = false
    closeOrConfirm(true, () => { closed = true }, () => { asked = true })
    expect(closed).toBe(false)
    expect(asked).toBe(true)
  })

  it('the discard prompt is an alertdialog that names both choices', () => {
    const html = renderToStaticMarkup(<DiscardChangesDialog open onKeep={noop} onDiscard={noop} />)
    expect(html).toContain('role="alertdialog"')
    expect(html).toContain('Discard unsaved changes?')
    expect(html).toContain('Keep editing')
    expect(html).toContain('Discard changes')
  })
})

describe('PageBody', () => {
  it('is the scrollable page region with the standard gutter', () => {
    const html = renderToStaticMarkup(<PageBody>content</PageBody>)
    expect(html).toContain('overflow-y-auto')
    expect(html).toContain('content')
  })

  it('can carry a one-line intro under the Topbar h1 without another heading', () => {
    const html = renderToStaticMarkup(<PageBody intro="Questions the AI flagged.">x</PageBody>)
    expect(html).toContain('Questions the AI flagged.')
    expect(html).not.toMatch(/<h[12]/)
  })
})
