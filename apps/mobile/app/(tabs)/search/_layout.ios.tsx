import { Stack } from 'expo-router'

/**
 * iOS: the Search tab (role="search" in app/(tabs)/_layout.ios.tsx) is a
 * stack, because the native search field belongs to a stack header: the page
 * adds it with Stack.SearchBar. On iOS 26 the system moves that field into
 * the glass tab bar; on iOS 18 it sits under the navigation bar.
 *
 * The header is transparent and untitled: the page keeps its own large
 * title and subtitle (TabHeader), as on the other tabs.
 */
const SEARCH_STACK_OPTIONS = {
  headerShown: true,
  headerTransparent: true,
  headerShadowVisible: false,
  title: '',
} as const

export default function SearchLayout() {
  return <Stack screenOptions={SEARCH_STACK_OPTIONS} />
}
