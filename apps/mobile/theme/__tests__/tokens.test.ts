import { darkTheme, lightTheme } from '../tokens'

// September 2026 accessibility audit follow-up: the ScoreDisclaimerModal's
// acknowledge button was white text directly on `t.warning` (#fbbf24 in dark
// ≈1.7:1) — a WCAG failure. `warningStrong`/`successStrong`/`dangerStrong`
// exist for the *text-on-that-status's-own-tint* role (DESIGN.md's `strong`
// role), distinct from `warning`/`success`/`danger` (text/icon on a plain
// surface, or as a fill behind white text). See tokens.ts for the measured
// contrast ratios computed against each theme's own *Surface tint.
describe('theme tokens', () => {
  it('darkTheme and lightTheme expose the same set of keys (no silent drift)', () => {
    expect(Object.keys(darkTheme).sort()).toEqual(Object.keys(lightTheme).sort())
  })

  it.each(['warningStrong', 'successStrong', 'dangerStrong'] as const)(
    '%s is defined as a string on both themes',
    (key) => {
      expect(typeof darkTheme[key]).toBe('string')
      expect(typeof lightTheme[key]).toBe('string')
    },
  )
})
