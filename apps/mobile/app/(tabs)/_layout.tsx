import { useCallback } from 'react'
import { Platform, View } from 'react-native'
import { Tabs } from 'expo-router'
import { TabBar } from '../../components/TabBar'
import { EdgeSwipeNavigator } from '../../components/EdgeSwipeNavigator'
import { SyncErrorBanner } from '../../components/SyncErrorBanner'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useDb } from '../../hooks/useDb'
import { syncOnLaunch } from '../../services/sync'
import { SidebarNav } from '../../components/web/SidebarNav'

export default function TabLayout() {
  const bp = useBreakpoint()
  const db = useDb()
  const isDesktopWeb = Platform.OS === 'web' && bp === 'lg'

  // Retry handler for the sync-error banner. syncOnLaunch marks start/done on
  // the syncStatus store itself, so the banner hides while the retry runs.
  const handleRetry = useCallback(() => {
    void syncOnLaunch(db)
  }, [db])

  if (isDesktopWeb) {
    // Desktop web: sidebar beside content; tab bar hidden.
    // The Tabs navigator still drives routing — sidebar items call router.push
    // to the tab routes. tabBar={() => null} suppresses the floating bar.
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <SidebarNav />
        {/* Center the content column at a comfortable max-width so screens that
            render their own FlatList/ScrollView (Lists, Exams) — bypassing
            ScreenScroll's centering — don't stretch edge-to-edge on wide
            monitors. 1040 matches ScreenScroll's MAX_WIDTH_LG for consistency. */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <View style={{ flex: 1, width: '100%', maxWidth: 1040 }}>
          <SyncErrorBanner onRetry={handleRetry} />
          <Tabs
            tabBar={() => null}
            screenOptions={{ headerShown: false, animation: 'none' }}
          >
            <Tabs.Screen name="index"    options={{ title: 'Home' }} />
            <Tabs.Screen name="practice" options={{ title: 'Exams' }} />
            <Tabs.Screen name="listings" options={{ title: 'Lists' }} />
            <Tabs.Screen name="updates"  options={{ title: 'Updates' }} />
            <Tabs.Screen name="analytics" options={{ href: null }} />
            <Tabs.Screen name="profile"  options={{ title: 'Profile' }} />
          </Tabs>
          </View>
        </View>
      </View>
    )
  }

  // Native (iOS/Android) and sm/md web: unchanged floating TabBar.
  return (
    <EdgeSwipeNavigator>
      <View style={{ flex: 1 }}>
      <SyncErrorBanner onRetry={handleRetry} />
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{ headerShown: false, animation: 'shift' }}
      >
        <Tabs.Screen name="index"    options={{ title: 'Home' }} />
        <Tabs.Screen name="practice" options={{ title: 'Exams' }} />
        <Tabs.Screen name="listings" options={{ title: 'Lists' }} />
        <Tabs.Screen name="updates"  options={{ title: 'Updates' }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
        {/* Profile is reachable from the Home header avatar (not shown in the tab bar). */}
        <Tabs.Screen name="profile"  options={{ title: 'Profile' }} />
      </Tabs>
      </View>
    </EdgeSwipeNavigator>
  )
}
