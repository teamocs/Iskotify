import {
  lightTheme, textStyles, textStyle, weight,
  iosTextStyles, iosTextStyle, iosTypeScale, legacyTextRoleMap, systemFont, systemFontFor,
  radius, motion, glass, layout,
} from '../tokens'

// WCAG relative-luminance helpers (hex or rgba() composited over a ground).
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

// September 2026 accessibility audit follow-up: the ScoreDisclaimerModal's
// acknowledge button was white text directly on `t.warning` — a WCAG failure. `warningStrong`/`successStrong`/`dangerStrong`
// exist for the *text-on-that-status's-own-tint* role (DESIGN.md's `strong`
// role), distinct from `warning`/`success`/`danger` (text/icon on a plain
// surface, or as a fill behind white text). See tokens.ts for the measured
// contrast ratios computed against each *Surface tint.
describe('theme tokens', () => {
  it.each(['warningStrong', 'successStrong', 'dangerStrong'] as const)(
    '%s is defined as a string',
    (key) => {
      expect(typeof lightTheme[key]).toBe('string')
    },
  )

  // Redesign M1 (direction C, "One Next Step") semantic additions.
  it.each([
    'successBorder', 'dangerBorder', 'warningBorder', 'accentBorder',
    'accentPressed', 'surfaceRaised', 'backdrop', 'focusRing',
  ] as const)('%s is defined as a string', (key) => {
    expect(typeof lightTheme[key]).toBe('string')
  })

  // WCAG 1.4.11: a form control's boundary is the only thing that shows where
  // to tap on a plain field, so it must clear 3:1 against every surface a field
  // sits on (page ground, card surface, raised sheet, tinted surface2).
  describe('inputBorder (form-control boundary)', () => {

    it('clears 3:1 on bg, surface, surfaceRaised and surface2', () => {
      const th = lightTheme
      expect(th.inputBorder).toMatch(/^#[0-9a-f]{6}$/i)
      const bg = hex(th.bg)
      const border = hex(th.inputBorder)
      for (const ground of [bg, rgba(th.surface, bg), rgba(th.surfaceRaised, bg), rgba(th.surface2, bg)]) {
        expect(ratio(border, ground)).toBeGreaterThanOrEqual(3)
      }
    })
  })

  it('the raised surface (sheets, dialogs) is opaque', () => {
    // A translucent sheet would show the screen through it.
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
  })

  it('only draws sizes from the iOS type scale', () => {
    for (const role of roles) expect(iosTypeScale).toContain(textStyles[role].fontSize)
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

  // P1b: Outfit/Lexend are retired; every role is the platform UI font.
  it('uses the system font on native (fontFamily undefined) and the system stack on web', () => {
    // jest-expo renders as iOS.
    for (const role of roles) expect(textStyles[role].fontFamily).toBeUndefined()
    expect(systemFontFor('web')).toMatch(/^-apple-system, BlinkMacSystemFont/)
    expect(systemFontFor('web')).not.toMatch(/Outfit|Lexend/)
  })

  it.each(roles)('%s carries an explicit fontWeight', (role) => {
    expect(textStyles[role].fontWeight).toMatch(/^[1-9]00$/)
  })

  it('weight() gives the system font at a weight (temporary, replaces fonts.*)', () => {
    expect(weight('600')).toEqual({ fontFamily: systemFont, fontWeight: '600' })
    expect(weight('700').fontFamily).toBeUndefined()
  })
})

// ── iOS-language redesign, P1a (additive: nothing below changes a screen) ────
describe('iOS text roles', () => {
  const roles = Object.keys(iosTextStyles) as (keyof typeof iosTextStyles)[]

  it('defines the Apple text styles plus the tabular numeric roles', () => {
    expect(roles).toEqual([
      'largeTitle', 'title1', 'title2', 'title3', 'headline', 'body',
      'callout', 'subheadline', 'footnote', 'caption', 'numeric', 'numericLg',
    ])
  })

  it.each([
    ['largeTitle', 34, 41, '700'],
    ['title1', 28, 34, '700'],
    ['title2', 22, 28, '700'],
    ['title3', 20, 25, '600'],
    ['headline', 17, 22, '600'],
    ['body', 17, 22, '400'],
    ['callout', 16, 21, '400'],
    ['subheadline', 15, 20, '400'],
    ['footnote', 13, 18, '400'],
    ['caption', 12, 16, '400'],
    ['numeric', 22, 28, '700'],
    ['numericLg', 34, 41, '700'],
  ] as const)('%s is %ipt on a %ipt line at weight %s', (role, size, line, weight) => {
    const s = iosTextStyles[role]
    expect(s.fontSize).toBe(size)
    expect(s.lineHeight).toBe(line)
    expect(s.fontWeight).toBe(weight)
  })

  it.each(roles)('%s respects the 12pt floor, a line height at least its size and the -0.04em tracking floor', (role) => {
    const s = iosTextStyles[role] as { fontSize: number; lineHeight: number; letterSpacing?: number }
    expect(s.fontSize).toBeGreaterThanOrEqual(12)
    expect(s.lineHeight).toBeGreaterThanOrEqual(s.fontSize)
    expect((s.letterSpacing ?? 0) / s.fontSize).toBeGreaterThanOrEqual(-0.04)
  })

  it('draws every size from the iOS type scale', () => {
    expect([...iosTypeScale]).toEqual([12, 13, 15, 16, 17, 20, 22, 28, 34])
    for (const role of roles) expect(iosTypeScale).toContain(iosTextStyles[role].fontSize)
  })

  it('numeric roles use tabular figures', () => {
    expect(iosTextStyles.numeric.fontVariant).toEqual(['tabular-nums'])
    expect(iosTextStyles.numericLg.fontVariant).toEqual(['tabular-nums'])
  })

  it('uses the system font: undefined on native (SF / Roboto), the system stack on web', () => {
    expect(systemFontFor('ios')).toBeUndefined()
    expect(systemFontFor('android')).toBeUndefined()
    expect(systemFontFor('web')).toMatch(/^-apple-system, BlinkMacSystemFont/)
    expect(systemFontFor('web')).toMatch(/system-ui, sans-serif$/)
    // jest-expo renders as iOS.
    expect(systemFont).toBeUndefined()
    for (const role of roles) expect(iosTextStyles[role].fontFamily).toBe(systemFont)
  })

  it('iosTextStyle() returns the role and merges a colour when given', () => {
    expect(iosTextStyle('body')).toEqual(iosTextStyles.body)
    expect(iosTextStyle('footnote', '#123456')).toEqual({ ...iosTextStyles.footnote, color: '#123456' })
  })

  it('maps every legacy role onto an iOS role for the P1b cut-over', () => {
    expect(legacyTextRoleMap).toEqual({
      display: 'largeTitle', title: 'title1', headline: 'title3', titleSm: 'headline',
      body: 'body', bodySm: 'footnote', label: 'footnote', button: 'headline',
      caption: 'caption', numeric: 'numeric', numericLg: 'numericLg',
    })
    for (const legacy of Object.keys(textStyles) as (keyof typeof legacyTextRoleMap)[]) {
      expect(iosTextStyles).toHaveProperty(legacyTextRoleMap[legacy])
    }
  })

  it('aliases each legacy role to its iOS role (P1b)', () => {
    for (const legacy of Object.keys(legacyTextRoleMap) as (keyof typeof legacyTextRoleMap)[]) {
      const { fontWeight: _w, ...ios } = iosTextStyles[legacyTextRoleMap[legacy]] as Record<string, unknown>
      const { fontWeight: _lw, ...legacyStyle } = textStyles[legacy] as Record<string, unknown>
      expect(legacyStyle).toEqual(ios)
    }
    expect(textStyles.body).toEqual(iosTextStyles.body)
    expect(textStyles.bodySm).toEqual(iosTextStyles.footnote)
    expect(textStyles.label).toEqual({ ...iosTextStyles.footnote, fontWeight: '600' })
    expect(textStyles.numeric).toEqual({ ...iosTextStyles.title2, fontVariant: ['tabular-nums'] })
    expect(textStyles.numericLg).toEqual({ ...iosTextStyles.largeTitle, fontVariant: ['tabular-nums'] })
  })
})

describe('radius tokens', () => {
  it('adds the iOS shape scale', () => {
    expect({
      chip: radius.chip, field: radius.field, button: radius.button, group: radius.group,
      card: radius.card, sheet: radius.sheet, capsule: radius.capsule,
    }).toEqual({ chip: 8, field: 12, button: 14, group: 18, card: 22, sheet: 28, capsule: 999 })
  })

  it('has the 36pt sign-in hero sheet', () => {
    expect(radius.heroSheet).toBe(36)
  })

  it('keeps the old keys as aliases with their old values', () => {
    expect({ md: radius.md, lg: radius.lg, xl: radius.xl, xxl: radius.xxl, pill: radius.pill })
      .toEqual({ md: 14, lg: 18, xl: 22, xxl: 28, pill: 999 })
  })

  it('has split sm into chip and field (P1c): no sm key remains', () => {
    expect('sm' in radius).toBe(false)
  })
})

describe('motion tokens', () => {
  it('defines the three springs', () => {
    expect(motion.spring.snappy).toEqual({ damping: 30, stiffness: 400 })
    expect(motion.spring.smooth).toEqual({ damping: 26, stiffness: 260 })
    expect(motion.spring.bouncy).toEqual({ damping: 14, stiffness: 220 })
  })

  it('defines the web curves, durations and press scale', () => {
    expect(motion.curve.snappy).toEqual({ easing: 'cubic-bezier(.2,.9,.25,1)', duration: 280 })
    expect(motion.curve.smooth).toEqual({ easing: 'cubic-bezier(.32,.72,0,1)', duration: 480 })
    expect(motion.duration).toEqual({ fade: 200, reduced: 160 })
    expect(motion.pressScale).toBe(0.97)
  })
})

describe('glass tokens', () => {
  it('carries the web recipe and the opaque fallback', () => {
    expect(glass.fill).toBe('rgba(255,255,255,0.42)')
    expect(glass.backdropFilter).toBe('blur(24px) saturate(200%) brightness(1.04)')
    expect(typeof glass.webShadow).toBe('string')
    expect(glass.opaque).toBe('#fdf4f4')
    expect(glass.opaque).toBe(lightTheme.bg)
  })

  it('uses only light system materials', () => {
    expect(glass.iosMaterial).toBe('systemChromeMaterialLight')
    expect(glass.androidTint).toBe('light')
    expect(glass.androidBlurMethod).toBe('dimezisBlurViewSdk31Plus')
  })

  // A label on glass reads against the glass fill composited over whatever
  // scrolls behind it. Checked over the three grounds the chrome floats on.
  describe('glass-label contrast', () => {
    const bg = hex(lightTheme.bg)
    const grounds = {
      bg,
      surface: rgba(lightTheme.surface, bg),
      accent: hex(lightTheme.accent),
    }
    const onGlass = (ground: number[]) => rgba(glass.fill, ground)

    it.each(Object.keys(grounds) as (keyof typeof grounds)[])('textPrimary clears 4.5:1 on glass over %s', (g) => {
      expect(ratio(hex(lightTheme.textPrimary), onGlass(grounds[g]))).toBeGreaterThanOrEqual(4.5)
    })

    it.each(['bg', 'surface'] as const)('accentText clears 4.5:1 on glass over %s', (g) => {
      expect(ratio(hex(lightTheme.accentText), onGlass(grounds[g]))).toBeGreaterThanOrEqual(4.5)
    })

    // Measured ~2:1, and hexes never change, so the contract is: a label on
    // glass that can float over solid maroon uses textPrimary.
    it('accentText fails on glass over solid accent, so labels there use textPrimary', () => {
      expect(ratio(hex(lightTheme.accentText), onGlass(grounds.accent))).toBeLessThan(4.5)
      expect(glass.labelOverAccent).toBe('textPrimary')
    })
  })
})

describe('sign-in sheet fill', () => {
  // Over the darkest thing behind it on the hero (the accentPressed shape).
  const ground = hex(lightTheme.accentPressed)
  const fill = rgba(glass.sheetFill, ground)
  it.each(['textPrimary', 'textSecondary', 'accentText'] as const)('%s clears 4.5:1 on the sheet over the maroon hero', (k) => {
    expect(ratio(hex(lightTheme[k]), fill)).toBeGreaterThanOrEqual(4.5)
  })
  it('is the page ground, translucent', () => {
    expect(glass.sheetFill).toBe('rgba(253,244,244,0.80)')
  })
})

describe('layout tokens', () => {
  it('adds the floating capsule, header button and row metrics', () => {
    expect(layout.tabCapsule).toEqual({ height: 62, inset: 16, bottom: 26 })
    expect(layout.searchCircle).toBe(62)
    expect(layout.headerButton).toEqual({ visual: 40, hit: 44 })
    expect(layout.rowMinHeight).toBe(44)
    expect(layout.iconTile).toBe(30)
    expect(layout.capsuleClearance).toBe(104)
  })

  it('keeps the current tab bar metrics (no visual change in P1a)', () => {
    expect(layout.tabBarHeight).toBe(64)
    expect(layout.tabBarClearance).toBe(80)
  })
})
