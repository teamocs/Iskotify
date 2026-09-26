import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, it, expect, vi } from 'vitest'
import { RowActions, handleMenuKeyDown, handleTriggerKeyDown } from '../RowActions'
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

  it('shows no native title tooltip on the trigger', () => {
    expect(html).not.toMatch(/<button[^>]*aria-label="Actions for Alpha"[^>]*title=|<button[^>]*title="Actions for Alpha"/)
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

/*
 * Keyboard contract (WAI-ARIA APG menu button). The admin tests run in node
 * with no DOM, so the key handling lives in pure functions that take the
 * effects as callbacks; the component wires them to refs and state.
 */
function effects() {
  return { preventDefault: vi.fn(), focusItem: vi.fn(), focusTrigger: vi.fn(), close: vi.fn(), open: vi.fn() }
}

describe('handleTriggerKeyDown (the closed menu button)', () => {
  it.each([['Enter'], [' '], ['ArrowDown']])('%j opens the menu on the first item', key => {
    const fx = effects()
    handleTriggerKeyDown(key, fx)
    expect(fx.open).toHaveBeenCalledWith('first')
    expect(fx.preventDefault).toHaveBeenCalled()
  })

  it('ArrowUp opens the menu on the last item', () => {
    const fx = effects()
    handleTriggerKeyDown('ArrowUp', fx)
    expect(fx.open).toHaveBeenCalledWith('last')
    expect(fx.preventDefault).toHaveBeenCalled()
  })

  it('leaves other keys (Tab, letters) to the browser', () => {
    for (const key of ['Tab', 'a', 'Escape']) {
      const fx = effects()
      handleTriggerKeyDown(key, fx)
      expect(fx.open).not.toHaveBeenCalled()
      expect(fx.preventDefault).not.toHaveBeenCalled()
    }
  })
})

describe('handleMenuKeyDown (focus inside the open menu)', () => {
  it('ArrowDown moves to the next item and wraps from the last to the first', () => {
    const fx = effects()
    handleMenuKeyDown('ArrowDown', 0, 3, fx)
    expect(fx.focusItem).toHaveBeenLastCalledWith(1)
    handleMenuKeyDown('ArrowDown', 2, 3, fx)
    expect(fx.focusItem).toHaveBeenLastCalledWith(0)
    expect(fx.preventDefault).toHaveBeenCalledTimes(2)
  })

  it('ArrowUp moves to the previous item and wraps from the first to the last', () => {
    const fx = effects()
    handleMenuKeyDown('ArrowUp', 1, 3, fx)
    expect(fx.focusItem).toHaveBeenLastCalledWith(0)
    handleMenuKeyDown('ArrowUp', 0, 3, fx)
    expect(fx.focusItem).toHaveBeenLastCalledWith(2)
  })

  it('arrows start from the ends when no item has focus yet (the menu itself does)', () => {
    const fx = effects()
    handleMenuKeyDown('ArrowDown', -1, 3, fx)
    expect(fx.focusItem).toHaveBeenLastCalledWith(0)
    handleMenuKeyDown('ArrowUp', -1, 3, fx)
    expect(fx.focusItem).toHaveBeenLastCalledWith(2)
  })

  it('Home and End jump to the first and last item', () => {
    const fx = effects()
    handleMenuKeyDown('Home', 2, 3, fx)
    expect(fx.focusItem).toHaveBeenLastCalledWith(0)
    handleMenuKeyDown('End', 0, 3, fx)
    expect(fx.focusItem).toHaveBeenLastCalledWith(2)
    expect(fx.preventDefault).toHaveBeenCalledTimes(2)
  })

  it('Escape closes and returns focus to the button', () => {
    const fx = effects()
    handleMenuKeyDown('Escape', 1, 3, fx)
    expect(fx.preventDefault).toHaveBeenCalled()
    expect(fx.close).toHaveBeenCalledTimes(1)
    expect(fx.focusTrigger).toHaveBeenCalledTimes(1)
  })

  it('Tab closes with focus moved to the button FIRST, and lets Tab move on from there', () => {
    // Hiding the menu while an item still holds focus blurs to <body>, and the
    // next Tab restarts at the top of the page. Focus must reach the trigger
    // before the menu is hidden; Tab's default action then continues from it.
    // Shift+Tab is the same key, so it goes back from the button the same way.
    const fx = effects()
    handleMenuKeyDown('Tab', 1, 3, fx)
    expect(fx.focusTrigger).toHaveBeenCalledTimes(1)
    expect(fx.close).toHaveBeenCalledTimes(1)
    expect(fx.focusTrigger.mock.invocationCallOrder[0]).toBeLessThan(fx.close.mock.invocationCallOrder[0]!)
    expect(fx.preventDefault).not.toHaveBeenCalled()
  })

  it('does nothing with arrows when every item is disabled', () => {
    const fx = effects()
    handleMenuKeyDown('ArrowDown', -1, 0, fx)
    expect(fx.focusItem).not.toHaveBeenCalled()
  })
})
