import { darkTheme, lightTheme, textStyles, textStyle, typography, fonts } from '../tokens'

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

  // Redesign M1 (direction C, "One Next Step") semantic additions.
  it.each([
    'successBorder', 'dangerBorder', 'warningBorder', 'accentBorder',
    'accentPressed', 'surfaceRaised', 'backdrop', 'focusRing',
  ] as const)('%s is defined as a string on both themes', (key) => {
    expect(typeof darkTheme[key]).toBe('string')
    expect(typeof lightTheme[key]).toBe('string')
  })

  // WCAG 1.4.11: a form control's boundary is the only thing that shows where
  // to tap on a plain field, so it must clear 3:1 against every surface a field
  // sits on (page ground, card surface, raised sheet, tinted surface2).
  describe('inputBorder (form-control boundary)', () => {
    const hex = (h: string) => [0, 2, 4].map(i => parseInt(h.replace('#', '').slice(i, i + 2), 16))
    const rgba = (s: string, over: number[]) => {
      const m = s.match(/rgba?\(([^)]+)\)/)
      if (!m) return hex(s)
      const [r, g, b, a = '1'] = m[1]!.split(',').map(x => x.trim())
      const al = Number(a)
      return [r, g, b].map((c, i) => Math.round(Number(c) * al + over[i]! * (1 - al)))
    }
    const lum = (rgb: number[]) => {
      const [r, g, b] = rgb.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4) })
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!
    }
    const ratio = (a: number[], b: number[]) => {
      const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p)
      return (x! + 0.05) / (y! + 0.05)
    }

    it.each([['light', lightTheme], ['dark', darkTheme]] as const)('%s theme clears 3:1 on bg, surface, surfaceRaised and surface2', (_n, th) => {
      expect(th.inputBorder).toMatch(/^#[0-9a-f]{6}$/i)
      const bg = hex(th.bg)
      const border = hex(th.inputBorder)
      for (const ground of [bg, rgba(th.surface, bg), rgba(th.surfaceRaised, bg), rgba(th.surface2, bg)]) {
        expect(ratio(border, ground)).toBeGreaterThanOrEqual(3)
      }
    })
  })

  it('the raised surface (sheets, dialogs) is opaque in both themes', () => {
    // A translucent sheet would show the screen through it.
    expect(darkTheme.surfaceRaised).toMatch(/^#[0-9a-f]{6}$/i)
    expect(lightTheme.surfaceRaised).toMatch(/^#[0-9a-f]{6}$/i)
  })
})

describe('type scale tokens', () => {
  const roles = Object.keys(textStyles) as (keyof typeof textStyles)[]

  it('defines the roles the redesign uses', () => {
    expect(roles).toEqual(expect.arrayContaining([
      'display', 'title', 'headline', 'titleSm', 'body', 'bodySm',
      'label', 'button', 'caption', 'numeric', 'numericLg',
    ]))
  })

  it.each(roles)('%s respects the 12pt floor and has a line height ≥ its size', (role) => {
    const s = textStyles[role]
    expect(s.fontSize).toBeGreaterThanOrEqual(12)
    expect(s.lineHeight).toBeGreaterThanOrEqual(s.fontSize)
    expect(typeof s.fontFamily).toBe('string')
  })

  it('only draws sizes from the typography scale', () => {
    const scale = Object.values(typography) as number[]
    for (const role of roles) expect(scale).toContain(textStyles[role].fontSize)
  })

  it('numeric roles use tabular figures so timers and scores do not jitter', () => {
    expect(textStyles.numeric.fontVariant).toEqual(['tabular-nums'])
    expect(textStyles.numericLg.fontVariant).toEqual(['tabular-nums'])
  })

  it('never tracks tighter than -0.04em', () => {
    for (const role of roles) {
      const s = textStyles[role] as { fontSize: number; letterSpacing?: number }
      const ls = s.letterSpacing ?? 0
      expect(ls / s.fontSize).toBeGreaterThanOrEqual(-0.04)
    }
  })

  it('textStyle() returns the role and merges a colour when given', () => {
    expect(textStyle('body')).toEqual(textStyles.body)
    expect(textStyle('label', '#123456')).toEqual({ ...textStyles.label, color: '#123456' })
  })

  it('exposes the loaded font families by role', () => {
    expect(fonts.heading).toBe('Outfit_700Bold')
    expect(fonts.body).toBe('Lexend_400Regular')
  })
})
