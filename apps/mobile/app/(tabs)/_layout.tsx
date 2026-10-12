import { useCallback } from 'react'
import { Platform, View } from 'react-native'
import { Tabs } from 'expo-router'
import { FloatingTabBar } from '../../components/navigation/FloatingTabBar'
import { TabBarScrollProvider } from '../../components/navigation/TabBarScrollContext'
import { SceneBlurTarget } from '../../components/navigation/SceneBlurTarget'
import { EdgeSwipeNavigator } from '../../components/EdgeSwipeNavigator'
import { SyncErrorBanner } from '../../components/SyncErrorBanner'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useDb } from '../../hooks/useDb'
import { syncOnLaunch } from '../../services/sync'
import { SidebarNav } from '../../components/web/SidebarNav'
import { useTheme } from '../../theme/ThemeContext'

/**
 * Four destinations: Today (index) · Practice · Explore · Progress, plus
 * Search (federated search; reached from the bar's search control).
 *
 * Not tabs any more (root-level routes, same URLs):
 *   - /profile   — a sheet from the avatar in every tab header / the sidebar;
 *   - /listings, /updates, /analytics — legacy redirects into Explore /
 *     Progress so old deep links and notifications keep working.
 */
// A flat array (not a fragment) so the navigator sees each Tabs.Screen directly.
const TAB_SCREENS = [
  <Tabs.Screen key="index"    name="index"    options={{ title: 'Today' }} />,
  <Tabs.Screen key="practice" name="practice" options={{ title: 'Practice' }} />,
  <Tabs.Screen key="explore"  name="explore"  options={{ title: 'Explore' }} />,
  <Tabs.Screen key="progress" name="progress" options={{ title: 'Progress' }} />,
  <Tabs.Screen key="search"   name="search"   options={{ title: 'Search' }} />,
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

  // ONE navigator for every width. Crossing the 1024 breakpoint (a desktop
  // browser being resized) only swaps the chrome — bottom bar vs sidebar — and
  // never the tree above <Tabs>. Two separate trees used to remount the
  // navigator and every tab screen, and the remounted screens' useFocusEffect
  // loads never fired, so they sat on skeletons until a reload. Every wrapper
  // below renders at every width; conditional children keep their slot (null)
  // so React reconciles the same <Tabs> instance.
  //
  // The floating bar (phones, tablets, compact/medium web) is drawn by Tabs
  // after the scenes. On Android each scene sits in its own BlurTargetView
  // (screenLayout) so the bar's glass can blur it; list cells never blur.
  return (
    <TabBarScrollProvider barHostsSearch={!isDesktopWeb}>
    <EdgeSwipeNavigator enabled={!isDesktopWeb}>
      <View style={{ flex: 1, flexDirection: 'row', backgroundColor: t.bg }}>
        {isDesktopWeb ? <SidebarNav /> : null}
        <View style={{ flex: 1, minWidth: 0, alignItems: 'center' }}>
          {/* Desktop: the 1040 cap keeps screens that render their own FlatList
              (and headers outside a scroll view) from stretching edge to edge on
              wide monitors; <Screen> narrows reading screens further to 720. */}
          <View style={{ flex: 1, width: '100%', maxWidth: isDesktopWeb ? 1040 : undefined }}>
            <SyncErrorBanner onRetry={handleRetry} />
            <Tabs
              tabBar={isDesktopWeb ? () => null : (props) => <FloatingTabBar {...props} />}
              screenOptions={{ headerShown: false, animation: isDesktopWeb ? 'none' : 'shift' }}
              screenLayout={({ children, route }) => <SceneBlurTarget routeKey={route.key}>{children}</SceneBlurTarget>}
            >
              {TAB_SCREENS}
            </Tabs>
          </View>
        </View>
      </View>
    </EdgeSwipeNavigator>
    </TabBarScrollProvider>
  )
}
