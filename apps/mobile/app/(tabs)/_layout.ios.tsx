import { View } from 'react-native'
// The ONLY file that uses native tabs: the API is unstable, so expo-router is
// pinned exactly in package.json and nothing else imports it.
import { NativeTabs } from 'expo-router/unstable-native-tabs'
import { useTabShell } from '../../components/navigation/useTabShell'
import { useTheme } from '../../theme/ThemeContext'

/**
 * iOS (redesign P2b): the system tab bar. Liquid Glass on iOS 26, which
 * minimizes on scroll down and gives Search the system search role (a
 * separate glass button that opens the field); the classic bar on iOS 18.
 * Android and web keep the floating bar (_layout.tsx); what both share lives
 * in useTabShell.
 *
 * Not here on purpose:
 *   - FloatingTabBar and its TabBarScrollProvider: the system draws the bar.
 *     Screens still call the scroll hooks; without the provider they are
 *     no-ops (components/navigation/TabBarScrollContext.tsx).
 *   - SceneBlurTarget: only Android needs blur targets.
 *   - EdgeSwipeNavigator: iOS has its own gestures.
 *
 * Minimize (and the bar's content inset) follows the scroll view in each
 * screen's first-descendant chain, so every tab keeps its scroll view first
 * (see test-utils/firstScrollDescendant.ts and the Screen / Explore tests).
 *
 * The legacy routes (/profile, /listings, /updates, /analytics) live outside
 * (tabs) since P2a; routes without a trigger would be hidden anyway.
 */
export default function TabLayout() {
  const { syncBanner, backgroundColor } = useTabShell()
  const { theme: t } = useTheme()

  return (
    <View style={{ flex: 1, backgroundColor }}>
      {syncBanner}
      <NativeTabs minimizeBehavior="onScrollDown" tintColor={t.accent}>
        <NativeTabs.Trigger name="index">
          <NativeTabs.Trigger.Icon sf={{ default: 'house', selected: 'house.fill' }} />
          <NativeTabs.Trigger.Label>Today</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="practice">
          <NativeTabs.Trigger.Icon sf="pencil.and.list.clipboard" />
          <NativeTabs.Trigger.Label>Practice</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="explore">
          <NativeTabs.Trigger.Icon sf="globe" />
          <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        <NativeTabs.Trigger name="progress">
          <NativeTabs.Trigger.Icon sf="chart.line.uptrend.xyaxis" />
          <NativeTabs.Trigger.Label>Progress</NativeTabs.Trigger.Label>
        </NativeTabs.Trigger>
        {/* The system search item: its own icon and localized "Search"
            title. The field comes from the Search tab's stack header
            (app/(tabs)/search/_layout.ios.tsx and Stack.SearchBar). */}
        <NativeTabs.Trigger name="search" role="search" />
      </NativeTabs>
    </View>
  )
}
