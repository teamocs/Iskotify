import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect } from 'vitest'
import { RowActions } from '../RowActions'
import { Table, TableRegion, Td, Th } from '../Table'

describe('RowActions (the row overflow menu)', () => {
  const html = renderToStaticMarkup(
    <RowActions
      label="Actions for Alpha"
      items={[
        { label: 'Edit', icon: 'pencil', onSelect: () => {} },
        { label: 'Mark resolved', onSelect: () => {}, disabled: true },
        { label: 'Delete', icon: 'trash', tone: 'danger', onSelect: () => {} },
      ]}
    />,
  )

  it('is a named menu button, collapsed by default', () => {
    expect(html).toMatch(/<button[^>]*aria-label="Actions for Alpha"/)
    expect(html).toMatch(/<button[^>]*aria-haspopup="menu"/)
    expect(html).toMatch(/<button[^>]*aria-expanded="false"/)
  })

  it('points the button at a menu of menuitems that is hidden until opened', () => {
    const controls = html.match(/aria-controls="([^"]+)"/)![1]
    expect(html).toMatch(new RegExp(`<div[^>]*id="${controls}"[^>]*role="menu"|<div[^>]*role="menu"[^>]*id="${controls}"`))
    expect(html).toMatch(/<div[^>]*role="menu"[^>]*hidden=""/)
    expect((html.match(/role="menuitem"/g) ?? []).length).toBe(3)
  })

  it('lets only the open item be tabbed to (roving tabindex) and disables what cannot run', () => {
    expect((html.match(/role="menuitem"[^>]*tabindex="-1"|tabindex="-1"[^>]*role="menuitem"/g) ?? []).length).toBe(3)
    expect(html).toMatch(/<button[^>]*(?:disabled=""[^>]*role="menuitem"|role="menuitem"[^>]*disabled="")[^>]*>[\s\S]*?Mark resolved/)
  })

  it('styles a destructive item with the danger token, not a raw colour', () => {
    expect(html).toMatch(/<button[^>]*class="[^"]*text-danger[^"]*"[^>]*>[\s\S]*?Delete/)
    expect(html).not.toMatch(/-\[#/)
  })
})

describe('table primitives', () => {
  it('TableRegion is a focusable, labelled scroll container', () => {
    const html = renderToStaticMarkup(<TableRegion label="Cards"><table><tbody><tr><td>x</td></tr></tbody></table></TableRegion>)
    expect(html).toMatch(/<div[^>]*role="region"/)
    expect(html).toContain('aria-label="Cards"')
    expect(html).toContain('tabindex="0"')
    expect(html).toContain('overflow-auto')
  })

  it('Th is a column header; numeric headers and cells align right in tabular figures', () => {
    const html = renderToStaticMarkup(
      <Table caption="Numbers"><thead><tr><Th numeric>Count</Th></tr></thead><tbody><tr><Td numeric>12</Td></tr></tbody></Table>,
    )
    expect(html).toMatch(/<caption[^>]*>Numbers<\/caption>/)
    expect(html).toMatch(/<th[^>]*scope="col"[^>]*class="[^"]*text-right/)
    expect(html).toMatch(/<td[^>]*class="[^"]*text-right[^"]*tabular-nums/)
  })
})
