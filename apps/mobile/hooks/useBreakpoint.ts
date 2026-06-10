import { useWindowDimensions } from 'react-native'

export type Breakpoint = 'sm' | 'md' | 'lg'

/**
 * Pure mapping function — no side effects, fully unit-testable.
 * sm < 768, md 768-1023, lg >= 1024.
 */
export function breakpointForWidth(width: number): Breakpoint {
  if (width >= 1024) return 'lg'
  if (width >= 768) return 'md'
  return 'sm'
}

/**
 * Returns the current breakpoint based on window width.
 * NOTE: native TABLETS (iPad / large Android) also report md/lg here — callers
 * applying web-only layout (sidebar, max-width, 3-col grids) must gate on
 * Platform.OS === 'web' themselves; the native app's layout stays phone-shaped.
 */
export function useBreakpoint(): Breakpoint {
  const { width } = useWindowDimensions()
  return breakpointForWidth(width)
}

/**
 * Pure helper for adaptive grid item width.
 * md/lg => 3-col layout ('31%'), sm => 2-col ('48%').
 * Unit-testable.
 */
export function gridItemWidth(bp: Breakpoint): '48%' | '31%' {
  return bp === 'sm' ? '48%' : '31%'
}
