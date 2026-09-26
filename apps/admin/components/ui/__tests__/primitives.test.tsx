import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { Button, IconButton, buttonClass } from '../Button'
import { Badge } from '../Badge'
import { Card } from '../Card'
import { EmptyState } from '../EmptyState'
import { ErrorBanner } from '../ErrorBanner'
import { Field, controlClass } from '../Field'
import { Icon } from '../Icon'
import { isTabbable, nextFocusIndex } from '../useFocusTrap'

const RAW_COLOUR = /(?:bg|text|border|ring|outline|shadow|from|to|via|fill|stroke)-\[(?:#|rgba?\()/

describe('Button', () => {
  it('is a real button that does not submit forms by accident', () => {
    const html = renderToStaticMarkup(<Button>Save</Button>)
    expect(html).toMatch(/^<button[^>]*type="button"/)
    expect(html).toContain('Save')
  })

  it('announces and blocks while loading, keeping its label', () => {
    const html = renderToStaticMarkup(<Button loading>Publish</Button>)
    expect(html).toContain('aria-busy="true"')
    expect(html).toContain('disabled=""')
    expect(html).toContain('Publish')
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/)
  })

  it.each(['primary', 'secondary', 'ghost', 'danger'] as const)('%s variant uses tokens only', variant => {
    const cls = buttonClass({ variant })
    expect(cls).not.toMatch(RAW_COLOUR)
    expect(cls).toContain('hover:')
  })

  it('primary uses the maroon token with a darker hover token', () => {
    expect(buttonClass({ variant: 'primary' })).toContain('bg-maroon')
    expect(buttonClass({ variant: 'primary' })).toContain('hover:bg-maroon-hover')
  })

  it('sizes keep text at or above the 12px floor', () => {
    expect(buttonClass({ size: 'sm' })).not.toMatch(/text-\[(?:9|10|11)px\]/)
  })
})

describe('IconButton', () => {
  it('requires and renders an accessible name, icon hidden from AT', () => {
    const html = renderToStaticMarkup(<IconButton icon="pencil" label="Edit DOST-SEI" />)
    expect(html).toContain('aria-label="Edit DOST-SEI"')
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/)
  })
})

describe('Badge', () => {
  it('always carries text, with tone as a data attribute', () => {
    const html = renderToStaticMarkup(<Badge tone="success">Active</Badge>)
    expect(html).toContain('Active')
    expect(html).toContain('data-tone="success"')
  })

  it('uses the strong-on-soft pairing for status tones', () => {
    for (const tone of ['success', 'warning', 'danger', 'info'] as const) {
      const html = renderToStaticMarkup(<Badge tone={tone}>x</Badge>)
      expect(html).toContain(`bg-${tone}-soft`)
      expect(html).toContain(`text-${tone}-strong`)
    }
  })

  it('stays at or above 12px', () => {
    expect(renderToStaticMarkup(<Badge>x</Badge>)).toContain('text-xs')
  })
})

describe('Card', () => {
  it('renders a titled section with a real heading', () => {
    const html = renderToStaticMarkup(<Card title="Sync history" description="Last 100 runs">body</Card>)
    expect(html).toMatch(/<section[^>]*aria-labelledby="([^"]+)"/)
    const id = html.match(/aria-labelledby="([^"]+)"/)![1]
    expect(html).toMatch(new RegExp(`<h2[^>]*id="${id}"[^>]*>Sync history</h2>`))
    expect(html).toContain('Last 100 runs')
  })

  it('can use a different heading level', () => {
    expect(renderToStaticMarkup(<Card title="T" headingLevel={3}>b</Card>)).toContain('<h3')
  })

  it('is a plain div without a title', () => {
    expect(renderToStaticMarkup(<Card>b</Card>)).toMatch(/^<div/)
  })
})

describe('EmptyState', () => {
  it('teaches the next step', () => {
    const html = renderToStaticMarkup(
      <EmptyState title="No listings yet" description="Run a sync to pull them from the sheet." action={<Button>Sync now</Button>} />,
    )
    expect(html).toContain('No listings yet')
    expect(html).toContain('Run a sync')
    expect(html).toContain('Sync now')
  })
})

describe('ErrorBanner', () => {
  it('is announced as an alert and names the problem', () => {
    const html = renderToStaticMarkup(<ErrorBanner title="Couldn’t load reports" message="relation does not exist" />)
    expect(html).toContain('role="alert"')
    expect(html).toContain('Couldn’t load reports')
    expect(html).toContain('relation does not exist')
    expect(html).toContain('text-danger-strong')
  })
})

describe('Field', () => {
  it('wires the label to the control', () => {
    const html = renderToStaticMarkup(
      <Field label="Title" id="title">{p => <input {...p} />}</Field>,
    )
    expect(html).toContain('<label for="title"')
    expect(html).toMatch(/<input[^>]*id="title"/)
  })

  it('generates an id when none is given', () => {
    const html = renderToStaticMarkup(<Field label="Title">{p => <input {...p} />}</Field>)
    const forId = html.match(/<label for="([^"]+)"/)![1]
    expect(html).toContain(`id="${forId}"`)
  })

  it('describes the control with its hint and error, and marks it invalid', () => {
    const html = renderToStaticMarkup(
      <Field label="Deadline" id="dl" hint="YYYY-MM-DD" error="Deadline is in the past">{p => <input {...p} />}</Field>,
    )
    expect(html).toContain('aria-describedby="dl-hint dl-error"')
    expect(html).toContain('aria-invalid="true"')
    expect(html).toMatch(/id="dl-error"[^>]*role="alert"|role="alert"[^>]*id="dl-error"/)
    expect(html).toContain('YYYY-MM-DD')
  })

  it('marks required fields with the attribute and a hidden asterisk', () => {
    const html = renderToStaticMarkup(<Field label="Title" id="t" required>{p => <input {...p} />}</Field>)
    expect(html).toMatch(/<input[^>]*required=""/)
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*>\*<\/span>/)
  })

  it('omits aria-describedby and aria-invalid when there is nothing to say', () => {
    const html = renderToStaticMarkup(<Field label="Title" id="t">{p => <input {...p} />}</Field>)
    expect(html).not.toContain('aria-describedby')
    expect(html).not.toContain('aria-invalid')
  })

  it('control class has a 3:1 boundary token and no raw colour', () => {
    expect(controlClass).toContain('border-control')
    expect(controlClass).not.toMatch(RAW_COLOUR)
  })
})

describe('Icon', () => {
  it('is decorative by default', () => {
    const html = renderToStaticMarkup(<Icon name="home" />)
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('focusable="false"')
  })
})

describe('nextFocusIndex (focus trap)', () => {
  it('wraps forward from the last element', () => {
    expect(nextFocusIndex(3, 2, false)).toBe(0)
  })
  it('wraps backward from the first element', () => {
    expect(nextFocusIndex(3, 0, true)).toBe(2)
  })
  it('lets the browser handle Tab in the middle', () => {
    expect(nextFocusIndex(3, 1, false)).toBeNull()
  })
  it('pulls focus back in when it is outside the container', () => {
    expect(nextFocusIndex(3, -1, false)).toBe(0)
    expect(nextFocusIndex(3, -1, true)).toBe(2)
  })
  it('does nothing when there is nothing to focus', () => {
    expect(nextFocusIndex(0, -1, false)).toBeNull()
  })
})

describe('isTabbable (focus trap candidates)', () => {
  // Minimal element stand-ins: the trap only asks for the tabindex attribute
  // and whether an ancestor (or the element) is `hidden`.
  const el = ({ tabindex = null as string | null, hiddenAncestor = false } = {}) => ({
    getAttribute: (name: string) => (name === 'tabindex' ? tabindex : null),
    closest: (sel: string) => (sel === '[hidden]' && hiddenAncestor ? {} : null),
  })

  it('accepts an ordinary focusable element', () => {
    expect(isTabbable(el())).toBe(true)
    expect(isTabbable(el({ tabindex: '0' }))).toBe(true)
  })
  it('rejects roving-tabindex elements (tabindex="-1"), e.g. menu items', () => {
    expect(isTabbable(el({ tabindex: '-1' }))).toBe(false)
  })
  it('rejects elements inside a [hidden] subtree, e.g. a closed row menu', () => {
    expect(isTabbable(el({ hiddenAncestor: true }))).toBe(false)
  })
})
