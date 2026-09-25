import { resolveColorScheme } from '../resolveColorScheme'

// Owner decision (2026-09): first launch defaults to LIGHT. An explicit user
// choice always wins; "system" follows the OS when the OS reports a scheme.
describe('resolveColorScheme', () => {
  it('defaults to light when following the system and the system reports nothing', () => {
    expect(resolveColorScheme('system', null)).toBe('light')
    expect(resolveColorScheme('system', undefined)).toBe('light')
  })

  it('follows the system scheme when it is known', () => {
    expect(resolveColorScheme('system', 'dark')).toBe('dark')
    expect(resolveColorScheme('system', 'light')).toBe('light')
  })

  it('treats an unrecognised system value (e.g. "unspecified") as unknown → light', () => {
    expect(resolveColorScheme('system', 'unspecified' as never)).toBe('light')
  })

  it('respects an explicit user choice over the system', () => {
    expect(resolveColorScheme('dark', 'light')).toBe('dark')
    expect(resolveColorScheme('light', 'dark')).toBe('light')
    expect(resolveColorScheme('dark', null)).toBe('dark')
  })
})
