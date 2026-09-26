import { describe, it, expect } from 'vitest'
import { resolveShortcut, isTypingTarget, INITIAL_SHORTCUT_STATE } from '../shortcuts'

const at = (ms: number) => ms

describe('resolveShortcut', () => {
  it('"?" opens the shortcuts help', () => {
    expect(resolveShortcut(INITIAL_SHORTCUT_STATE, '?', at(0)).action).toEqual({ type: 'show-help' })
  })

  it('"/" focuses search', () => {
    expect(resolveShortcut(INITIAL_SHORTCUT_STATE, '/', at(0)).action).toEqual({ type: 'focus-search' })
  })

  it('"g" arms a sequence and does nothing on its own', () => {
    const r = resolveShortcut(INITIAL_SHORTCUT_STATE, 'g', at(100))
    expect(r.action).toBeNull()
    expect(r.state.pendingSince).toBe(100)
  })

  it.each([
    ['h', '/admin'],
    ['c', '/admin/flashcards'],
    ['i', '/admin/reports'],
  ])('"g %s" navigates to %s', (key, href) => {
    const armed = resolveShortcut(INITIAL_SHORTCUT_STATE, 'g', at(0)).state
    const r = resolveShortcut(armed, key, at(500))
    expect(r.action).toEqual({ type: 'navigate', href })
    expect(r.state.pendingSince).toBeNull()
  })

  it('a second key after the timeout does not navigate', () => {
    const armed = resolveShortcut(INITIAL_SHORTCUT_STATE, 'g', at(0)).state
    expect(resolveShortcut(armed, 'h', at(5000)).action).toBeNull()
  })

  it('an unknown second key cancels the sequence', () => {
    const armed = resolveShortcut(INITIAL_SHORTCUT_STATE, 'g', at(0)).state
    const r = resolveShortcut(armed, 'x', at(10))
    expect(r.action).toBeNull()
    expect(r.state.pendingSince).toBeNull()
  })

  it('"h" alone does nothing', () => {
    expect(resolveShortcut(INITIAL_SHORTCUT_STATE, 'h', at(0)).action).toBeNull()
  })
})

describe('isTypingTarget', () => {
  it('treats text inputs, textareas, selects and contenteditable as typing', () => {
    expect(isTypingTarget({ tagName: 'INPUT', type: 'text' })).toBe(true)
    expect(isTypingTarget({ tagName: 'INPUT', type: 'search' })).toBe(true)
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })

  it('does not treat buttons, checkboxes or the page as typing', () => {
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isTypingTarget({ tagName: 'INPUT', type: 'checkbox' })).toBe(false)
    expect(isTypingTarget({ tagName: 'BODY' })).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
  })
})

describe('SHORTCUT_LIST', () => {
  it('documents the sidebar toggle as a chord (keys held together)', async () => {
    const { SHORTCUT_LIST } = await import('../shortcuts')
    const toggle = SHORTCUT_LIST.find(s => s.label === 'Collapse or expand the sidebar')
    expect(toggle).toEqual({ keys: ['Ctrl', 'B'], label: 'Collapse or expand the sidebar', chord: true })
  })
})
