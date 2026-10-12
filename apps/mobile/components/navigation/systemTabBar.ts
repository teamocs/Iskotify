import { Platform } from 'react-native'

/**
 * iOS draws the system tab bar (native tabs, app/(tabs)/_layout.ios.tsx):
 * Liquid Glass on iOS 26, the classic bar on iOS 18. The first scroll view
 * of each tab screen then gets the bar's height (and the home indicator) as
 * an automatic content inset, so tab screens add only their page gap at the
 * bottom. Android and web draw the floating capsule instead and reserve
 * layout.capsuleClearance for it.
 *
 * Read at render time (not cached at import) so tests can switch platforms.
 */
export function usesSystemTabBar(): boolean {
  return Platform.OS === 'ios'
}
