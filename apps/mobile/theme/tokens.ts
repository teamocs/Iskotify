import { Platform, type TextStyle } from 'react-native'

// ── Design tokens (Refined Maroon, 2026) ─────────────────────────────────────
// One source of truth for color, type, spacing, radius, elevation. Iskotify has
// ONE palette — this light theme; there is no dark mode and no theme setting
// (guarded by __tests__/lightOnly.test.ts). It is contrast-tuned to WCAG:
// primary text ≥ 7:1, secondary ≥ 4.5:1, tertiary ≥ 3:1. Adding a key here
// propagates to every screen via useTheme().

export const lightTheme = {
  bg:            '#fdf4f4',
  surface:       '#ffffff',
  surface2:      'rgba(128,0,0,0.06)',
  border:        'rgba(128,0,0,0.14)',
  textPrimary:   '#2d0a0a',
  textSecondary: '#6b3737',
  textTertiary:  'rgba(45,10,10,0.62)',     // 0.52 → 0.58 → 0.62; measured 5.09:1 on #fdf4f4 and #ffffff
  accent:        '#800000',
  accentText:    '#9b1c1c',
  accentSurface: 'rgba(128,0,0,0.10)',
  accentStrong:  'rgba(128,0,0,0.82)',     // opaque maroon for filled pills, badges, active tabs
  textInverse:   '#ffffff',                // text/icons on the maroon accent
  // Semantic status colors — darker on the light palette so they meet contrast on white.
  success:       '#15803d',                // was #16a34a: 3.05:1, failed AA on both light surfaces → 4.64:1
  successSurface:'rgba(21,128,61,0.10)',
  danger:        '#b91c1c',                // was #dc2626: 4.47:1, just under AA → 5.98:1
  dangerSurface: 'rgba(185,28,28,0.10)',
  warning:       '#b45309',
  warningSurface:'rgba(180,83,9,0.10)',
  // `*Strong` — DESIGN.md's "strong" role: text/icons sitting ON that status's
  // own `*Surface` tint (never on a plain surface — use the DEFAULT color there).
  // The tints blend a saturated color at only 10%
  // over a near-white bg, so the DEFAULT color falls short here — each is
  // darkened until it clears 4.5:1 against its own blended *Surface tint
  // (measured, WCAG relative-luminance formula; mirrors the web preset's
  // `-strong` shades in DESIGN.md):
  //   successStrong #166534 on successSurface-over-bg (~#E6E8E2): 5.77:1
  //   dangerStrong  #991b1b on dangerSurface-over-bg  (~#F6DEDE): 6.50:1
  //   warningStrong #92400e on warningSurface-over-bg (~#F6E4DD): 5.74:1
  // (The base `warning` #b45309 measures only ~4.08:1 here — under AA.)
  successStrong: '#166534',
  dangerStrong:  '#991b1b',
  warningStrong: '#92400e',
  // Opaque (was 0.92): scrolled content showed through behind tab labels.
  tabBar:        '#fdf4f4',
  divider:       'rgba(128,0,0,0.14)',
  surfaceSubtle: 'rgba(128,0,0,0.05)',
  // Elevation — soft maroon-tinted shadows for the warm light palette.
  shadowSm:      '0px 1px 3px rgba(128,0,0,0.08)',
  shadowMd:      '0px 8px 24px rgba(128,0,0,0.12)',
  // Full-screen media viewer (figure zoom): dark so the image is the only
  // bright thing on screen; controls on it use textInverse.
  scrim:         'rgba(0,0,0,0.92)',
  scrimControl:  'rgba(255,255,255,0.15)',
  // ── Redesign M1 (direction C) additions ─────────────────────────────────
  // Borders clear 3:1 (WCAG 1.4.11) against BOTH #fdf4f4 and #ffffff:
  //   successBorder 3.32 / 3.49 · dangerBorder 3.31 / 3.46
  //   warningBorder 3.33 / 3.53 · accentBorder 3.10 / 3.18
  successBorder: 'rgba(21,128,61,0.80)',
  dangerBorder:  'rgba(185,28,28,0.65)',
  warningBorder: 'rgba(180,83,9,0.80)',
  accentBorder:  'rgba(128,0,0,0.50)',
  // Pressed fill for the maroon primary action. White on it: 14.43:1.
  accentPressed: '#5c0000',
  // Sheets/dialogs sit on plain white (all text tokens measured on #ffffff).
  surfaceRaised: '#ffffff',
  backdrop:      'rgba(45,10,10,0.40)',
  // Keyboard focus ring: 10.13:1 on bg.
  focusRing:     '#800000',
  // Boundary of a form control (text field, search, select). `border` is a
  // decorative hairline and can't show where a field is on its own; this
  // clears WCAG 1.4.11's 3:1 on every ground a field sits on. Maroon-tinted
  // grey so it sits in the warm palette. Measured (WCAG formula):
  //   bg #fdf4f4 3.48 · surface #ffffff 3.76 · surfaceRaised 3.76 · surface2 3.09
  inputBorder:   '#9c7c7c',
}

// Type scale (min 12 for readability — no body/label below 12pt).
export const typography = {
  xs:      12,   // was 11 (below the readable minimum)
  sm:      13,
  base:    16,
  md:      17,
  lg:      20,
  xl:      22,
  h3:      26,
  h2:      30,
  h1:      36,
  display: 48,
} as const

// ── Type: the platform UI font (iOS redesign P1a/P1b) ─────────────────────────
// Every word is drawn in the system font. The brand fonts were retired in P1b;
// the legacy roles below are aliases of these iOS roles.

/** The platform UI font for a given OS: undefined on native (SF Pro on iOS,
 *  Roboto on Android, which also gets Dynamic Type for free), the system
 *  stack on web. */
export function systemFontFor(os: string): string | undefined {
  return os === 'web'
    ? "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Segoe UI Variable Text', 'Segoe UI', Roboto, system-ui, sans-serif"
    : undefined
}

export const systemFont = systemFontFor(Platform.OS)

/** Apple's type ramp at the default (Large) content size. Floor stays 12. */
export const iosTypeScale = [12, 13, 15, 16, 17, 20, 22, 28, 34] as const

type IosTextRoleStyle = {
  fontFamily: string | undefined
  fontSize: (typeof iosTypeScale)[number]
  lineHeight: number
  fontWeight: '400' | '600' | '700'
  letterSpacing?: number
  fontVariant?: TextStyle['fontVariant']
}

/**
 * iOS text roles (Apple HIG sizes/leading at the default content size). The
 * system font applies its own optical tracking, so no letterSpacing is set.
 * Use via `<Text role>` (components/ui/Text) or `iosTextStyle(role, color)`.
 */
export const iosTextStyles = {
  largeTitle:  { fontFamily: systemFont, fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title1:      { fontFamily: systemFont, fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2:      { fontFamily: systemFont, fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3:      { fontFamily: systemFont, fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline:    { fontFamily: systemFont, fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body:        { fontFamily: systemFont, fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout:     { fontFamily: systemFont, fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subheadline: { fontFamily: systemFont, fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote:    { fontFamily: systemFont, fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption:     { fontFamily: systemFont, fontSize: 12, lineHeight: 16, fontWeight: '400' },
  // Timers, scores, countdowns: title2 / largeTitle metrics with tabular figures.
  numeric:     { fontFamily: systemFont, fontSize: 22, lineHeight: 28, fontWeight: '700', fontVariant: ['tabular-nums'] },
  numericLg:   { fontFamily: systemFont, fontSize: 34, lineHeight: 41, fontWeight: '700', fontVariant: ['tabular-nums'] },
} as const satisfies Record<string, IosTextRoleStyle>

export type IosTextRole = keyof typeof iosTextStyles

/** An iOS text role as a TextStyle, optionally with a colour (a theme token). */
export function iosTextStyle(role: IosTextRole, color?: string): TextStyle {
  const base = iosTextStyles[role] as TextStyle
  return color ? { ...base, color } : { ...base }
}

type LegacyTextRole =
  | 'display' | 'title' | 'headline' | 'titleSm' | 'body' | 'bodySm'
  | 'label' | 'button' | 'caption' | 'numeric' | 'numericLg'

/** Where each legacy role lands (`label` also takes fontWeight 600). The
 *  cut-over is a token edit, so the `textStyle()` call sites are unchanged. */
export const legacyTextRoleMap = {
  display:   'largeTitle',
  title:     'title1',
  headline:  'title3',
  titleSm:   'headline',
  body:      'body',
  bodySm:    'footnote',
  label:     'footnote',
  button:    'headline',
  caption:   'caption',
  numeric:   'numeric',
  numericLg: 'numericLg',
} as const satisfies Record<LegacyTextRole, IosTextRole>

/**
 * Legacy type roles, now aliases of the iOS roles (see legacyTextRoleMap).
 * Kept so existing `textStyle(role, color)` call sites work unchanged; new
 * code uses `<Text role>` or `iosTextStyle()`.
 */
export const textStyles = {
  display:   iosTextStyles[legacyTextRoleMap.display],
  title:     iosTextStyles[legacyTextRoleMap.title],
  headline:  iosTextStyles[legacyTextRoleMap.headline],
  titleSm:   iosTextStyles[legacyTextRoleMap.titleSm],
  body:      iosTextStyles[legacyTextRoleMap.body],
  bodySm:    iosTextStyles[legacyTextRoleMap.bodySm],
  label:     { ...iosTextStyles[legacyTextRoleMap.label], fontWeight: '600' },
  button:    iosTextStyles[legacyTextRoleMap.button],
  caption:   iosTextStyles[legacyTextRoleMap.caption],
  numeric:   iosTextStyles[legacyTextRoleMap.numeric],
  numericLg: iosTextStyles[legacyTextRoleMap.numericLg],
} as const satisfies Record<LegacyTextRole, IosTextRoleStyle>

export type TextStyleRole = keyof typeof textStyles

/** A type role as a TextStyle, optionally with a colour (pass a theme token). */
export function textStyle(role: TextStyleRole, color?: string): TextStyle {
  const base = textStyles[role] as TextStyle
  return color ? { ...base, color } : { ...base }
}

/**
 * The system font at a given weight. Temporary (P1b): it replaces the retired
 * per-weight brand font names (regular, medium, semibold, bold) at the sites
 * that set a weight on top of a role.
 */
export function weight<W extends '400' | '500' | '600' | '700'>(w: W): { fontFamily: string | undefined; fontWeight: W } {
  return { fontFamily: systemFont, fontWeight: w }
}

/**
 * Motion. Native springs feed Reanimated `withSpring`; the curves are their
 * web (CSS / motion) equivalents. Animate transform and opacity only; under
 * Reduce Motion travel becomes a `duration.reduced` crossfade.
 */
export const motion = {
  spring: {
    snappy: { damping: 30, stiffness: 400 },  // press, segments, tabs
    smooth: { damping: 26, stiffness: 260 },  // sheets, push, large title
    bouncy: { damping: 14, stiffness: 220 },  // correct answer, streak (once)
  },
  curve: {
    snappy: { easing: 'cubic-bezier(.2,.9,.25,1)', duration: 280 },
    smooth: { easing: 'cubic-bezier(.32,.72,0,1)', duration: 480 },
  },
  duration: {
    fade:    200,  // toasts, skeleton to content
    reduced: 160,  // Reduce Motion crossfade
  },
  pressScale: 0.97,
} as const

/**
 * Glass chrome (tab capsule, header band, header buttons). Tiers are chosen
 * by hooks/usePlatformCapabilities and drawn by components/ui/Glass.
 * Measured on the WCAG formula, `fill` composited over bg / surface / accent
 * gives textPrimary 17.36 / 18.11 / 4.55:1 and accentText 7.81 / 8.15 / 2.05:1.
 * accentText fails over solid maroon, so a label that can float over
 * accent uses `labelOverAccent`.
 */
export const glass = {
  // Web recipe (canvas "Mobile-Navigation", .glass).
  fill:           'rgba(255,255,255,0.42)',
  backdropFilter: 'blur(24px) saturate(200%) brightness(1.04)',
  webShadow:
    'inset 0 1px 0 rgba(255,255,255,0.95), inset 0 -1px 0 rgba(255,255,255,0.35), ' +
    'inset 0 0 0 1px rgba(255,255,255,0.55), 0 0 0 0.5px rgba(128,0,0,0.14), ' +
    '0 8px 32px rgba(45,10,10,0.16), 0 1px 3px rgba(45,10,10,0.08)',
  // Reduce Transparency, Android API 30 and below, no backdrop-filter: the page ground.
  opaque:         lightTheme.bg,  // #fdf4f4
  // Native materials: light only (guarded by __tests__/lightOnly.test.ts).
  iosMaterial:       'systemChromeMaterialLight',
  iosIntensity:      100,
  androidTint:       'light',
  androidBlurMethod: 'dimezisBlurViewSdk31Plus',
  androidIntensity:  60,
  androidBlurReductionFactor: 4,
  labelOverAccent: 'textPrimary',
} as const satisfies { labelOverAccent: keyof typeof lightTheme } & Record<string, string | number>

// 4/8 spacing rhythm.
export const spacing = {
  xs:   4,
  sm:   8,
  md:   12,
  lg:   16,
  xl:   20,
  xxl:  24,
  xxxl: 32,
} as const

// Corner radii (use with { borderCurve: 'continuous' } except pill/capsule).
// The iOS shape scale (chip … capsule) is the target; the old keys stay as
// aliases until the final P4 PR (sm splits into chip/field in P1c).
export const radius = {
  sm:   10,
  md:   14,
  lg:   18,
  xl:   22,
  xxl:  28,
  pill: 999,
  chip:    8,
  field:   12,
  button:  14,
  group:   18,   // inset grouped list
  card:    22,
  sheet:   28,
  capsule: 999,
} as const

// Layout constants. The bottom tab bar is a flat absolute bar of `tabBarHeight`
// plus the device's bottom safe-area inset; screens should reserve
// `tabBarHeight + content gap` ABOVE the safe-area inset to avoid overlap.
// Use at call sites as: paddingBottom: insets.bottom + layout.tabBarClearance.
export const layout = {
  tabBarHeight:    64,
  tabBarClearance: 80,  // tabBarHeight + 16 gap (add insets.bottom at the call site)
  // ── iOS redesign (P1a, unused until P2c) ──
  // Floating glass capsule: 62 tall, 16 from each side, 26 above the safe area.
  tabCapsule:       { height: 62, inset: 16, bottom: 26 },
  searchCircle:     62,
  headerButton:     { visual: 40, hit: 44 },
  rowMinHeight:     44,
  iconTile:         30,
  // Content clearance under the capsule: 62 + 26 + 16 gap (add insets.bottom).
  // Replaces tabBarClearance when the capsule ships in P2c.
  capsuleClearance: 104,
} as const

export type Theme      = typeof lightTheme
export type Typography = typeof typography
export type Spacing    = typeof spacing
export type Radius     = typeof radius
export type Motion     = typeof motion
export type Glass      = typeof glass
