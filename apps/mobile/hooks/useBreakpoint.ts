import { useWindowDimensions } from 'react-native'

/**
 * Window-size classes (Material 3): compact < 600, medium 600–1023,
 * expanded ≥ 1024. `useWindowDimensions` reports the browser viewport on web
 * and the window on native, so the same numbers drive the web build and
 * native tablets.
 *
 * Layout that only makes sense on web (the desktop sidebar) must still gate on
 * `Platform.OS === 'web'` at the call site; spacing and max-width decisions
 * are safe on every platform.
 */
export type Breakpoint = 'compact' | 'medium' | 'expanded'

export const BREAKPOINTS = { medium: 600, expanded: 1024 } as const

/** Pure mapping — no side effects, fully unit-testable. */
export function breakpointForWidth(width: number): Breakpoint {
  if (!Number.isFinite(width)) return 'compact'
  if (width >= BREAKPOINTS.expanded) return 'expanded'
  if (width >= BREAKPOINTS.medium) return 'medium'
  return 'compact'
}

export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions()
  return breakpointForWidth(width)
}

export function isCompact(bp: Breakpoint): boolean {
  return bp === 'compact'
}

/** Adaptive grid item width: 2 columns on compact, 3 from medium up. */
export function gridItemWidth(bp: Breakpoint): '48%' | '31%' {
  return bp === 'compact' ? '48%' : '31%'
}

/** Horizontal page gutter per size class (16 / 24 / 32 — spacing.lg/xxl/xxxl). */
export function pagePadding(bp: Breakpoint): number {
  if (bp === 'expanded') return 32
  if (bp === 'medium') return 24
  return 16
}

/**
 * Content max widths. `reading` keeps prose and single-column task screens at
 * a readable measure; `wide` is for two-column and dashboard layouts.
 */
export function contentMaxWidth(variant: 'reading' | 'wide'): number {
  return variant === 'reading' ? 720 : 1040
}

/** Columns a two-column layout should use: side-by-side only when expanded. */
export function columnCount(bp: Breakpoint): 1 | 2 {
  return bp === 'expanded' ? 2 : 1
}
