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
import { useTheme } from '../../theme/ThemeContext'

/**
 * Four destinations: Today (index) · Practice · Explore · Progress.
 *
 * Still registered but never drawn in the bar:
 *   - profile   — opened from the avatar in every tab header / the sidebar;
 *   - listings, updates, analytics — legacy routes that redirect into
 *     Explore / Progress so old deep links and notifications keep working.
 */
// A flat array (not a fragment) so the navigator sees each Tabs.Screen directly.
const TAB_SCREENS = [
  <Tabs.Screen key="index"     name="index"     options={{ title: 'Today' }} />,
  <Tabs.Screen key="practice"  name="practice"  options={{ title: 'Practice' }} />,
  <Tabs.Screen key="explore"   name="explore"   options={{ title: 'Explore' }} />,
  <Tabs.Screen key="progress"  name="progress"  options={{ title: 'Progress' }} />,
  <Tabs.Screen key="profile"   name="profile"   options={{ title: 'Profile' }} />,
  <Tabs.Screen key="listings"  name="listings"  options={{ title: 'Explore' }} />,
  <Tabs.Screen key="updates"   name="updates"   options={{ title: 'Explore' }} />,
  <Tabs.Screen key="analytics" name="analytics" options={{ title: 'Progress' }} />,
]

export default function TabLayout() {
  const bp = useBreakpoint()
  const db = useDb()
  const { theme: t } = useTheme()
  const isDesktopWeb = Platform.OS === 'web' && bp === 'expanded'

  // Retry handler for the sync-error banner. syncOnLaunch marks start/done on
  // the syncStatus store itself, so the banner hides while the retry runs.
  const handleRetry = useCallback(() => {
    void syncOnLaunch(db)
  }, [db])

  if (isDesktopWeb) {
    // Desktop web: persistent sidebar beside the content; no bottom bar.
    // The 1040 cap keeps screens that render their own FlatList (and headers
    // outside a scroll view) from stretching edge to edge on wide monitors;
    // <Screen> narrows reading screens further to 720.
    return (
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.bg }}>
        <SidebarNav />
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
          <View style={{ flex: 1, width: '100%', maxWidth: 1040 }}>
            <SyncErrorBanner onRetry={handleRetry} />
            <Tabs tabBar={() => null} screenOptions={{ headerShown: false, animation: 'none' }}>
              {TAB_SCREENS}
            </Tabs>
          </View>
        </View>
      </View>
    )
  }

  // Phones, tablets and mid-width web: bottom navigation bar.
  return (
    <EdgeSwipeNavigator>
      <View style={{ flex: 1 }}>
        <SyncErrorBanner onRetry={handleRetry} />
        <Tabs
          tabBar={(props) => <TabBar {...props} />}
          screenOptions={{ headerShown: false, animation: 'shift' }}
        >
          {TAB_SCREENS}
        </Tabs>
      </View>
    </EdgeSwipeNavigator>
  )
}
