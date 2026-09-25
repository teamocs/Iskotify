import { describe, it, expect, beforeEach } from 'vitest'
import { pushTrap, popTrap, isTopTrap, resetTrapStack } from '../trapStack'

// Stacked overlays (a drawer with a confirm on top) must behave as one modal at
// a time: only the topmost trap may react to Escape and Tab.
describe('trapStack', () => {
  beforeEach(() => resetTrapStack())

  it('makes the most recently opened trap the only one on top', () => {
    const drawer = Symbol('drawer')
    const confirm = Symbol('confirm')
    pushTrap(drawer)
    expect(isTopTrap(drawer)).toBe(true)
    pushTrap(confirm)
    expect(isTopTrap(confirm)).toBe(true)
    expect(isTopTrap(drawer)).toBe(false)
  })

  it('hands control back to the trap underneath when the top one closes', () => {
    const drawer = Symbol('drawer')
    const confirm = Symbol('confirm')
    pushTrap(drawer)
    pushTrap(confirm)
    popTrap(confirm)
    expect(isTopTrap(drawer)).toBe(true)
  })

  it('removes a trap that closes out of order without disturbing the top', () => {
    const a = Symbol('a')
    const b = Symbol('b')
    pushTrap(a)
    pushTrap(b)
    popTrap(a)
    expect(isTopTrap(b)).toBe(true)
    popTrap(b)
    expect(isTopTrap(b)).toBe(false)
  })
})
