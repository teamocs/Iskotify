import { Platform, type ViewStyle } from 'react-native'
import { useBreakpoint, contentMaxWidth, type Breakpoint } from '../../hooks/useBreakpoint'

// Max-width constants for content centering on wide web viewports.
// Keep in sync with components/ui/ScreenScroll.tsx (MAX_WIDTH_LG / MAX_WIDTH_MD).
const MAX_WIDTH_LG = contentMaxWidth('wide')
const MAX_WIDTH_MD = contentMaxWidth('reading')

/**
 * Pure helper: web-only max-width centering style for stack screens that
 * render a FlatList/ScrollView directly (instead of ScreenScroll).
 *
 * Returns null on native and on small web viewports so native rendering
 * stays byte-identical. Apply the result to contentContainerStyle (vertical
 * lists) — do NOT apply it to horizontal ScrollViews/chip rails.
 */
export function webContentStyle(bp: Breakpoint): ViewStyle | null {
  if (Platform.OS !== 'web') return null
  if (bp === 'compact') return null
  return {
    width: '100%',
    maxWidth: bp === 'expanded' ? MAX_WIDTH_LG : MAX_WIDTH_MD,
    alignSelf: 'center',
  }
}

/**
 * Hook flavor: reads the current breakpoint and returns the centering style
 * (or null off-web / on sm). Mirrors ScreenScroll's md/lg max-width behavior.
 */
export function useWebContentWidth(): ViewStyle | null {
  const bp = useBreakpoint()
  return webContentStyle(bp)
}
