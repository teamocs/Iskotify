import { Platform, View } from 'react-native'
import { Tabs } from 'expo-router'
import { TabBar } from '../../components/TabBar'
import { EdgeSwipeNavigator } from '../../components/EdgeSwipeNavigator'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { SidebarNav } from '../../components/web/SidebarNav'

export default function TabLayout() {
  const bp = useBreakpoint()
  const isDesktopWeb = Platform.OS === 'web' && bp === 'lg'

  if (isDesktopWeb) {
    // Desktop web: sidebar beside content; tab bar hidden.
    // The Tabs navigator still drives routing — sidebar items call router.push
    // to the tab routes. tabBar={() => null} suppresses the floating bar.
    return (
      <View style={{ flex: 1, flexDirection: 'row' }}>
        <SidebarNav />
        <View style={{ flex: 1 }}>
          <Tabs
            tabBar={() => null}
            screenOptions={{ headerShown: false, animation: 'none' }}
          >
            <Tabs.Screen name="index"    options={{ title: 'Home' }} />
            <Tabs.Screen name="practice" options={{ title: 'Review' }} />
            <Tabs.Screen name="listings" options={{ title: 'Lists' }} />
            <Tabs.Screen name="updates"  options={{ title: 'Updates' }} />
            <Tabs.Screen name="analytics" options={{ href: null }} />
            <Tabs.Screen name="profile"  options={{ title: 'Profile' }} />
          </Tabs>
        </View>
      </View>
    )
  }

  // Native (iOS/Android) and sm/md web: unchanged floating TabBar.
  return (
    <EdgeSwipeNavigator>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{ headerShown: false, animation: 'shift' }}
      >
        <Tabs.Screen name="index"    options={{ title: 'Home' }} />
        <Tabs.Screen name="practice" options={{ title: 'Review' }} />
        <Tabs.Screen name="listings" options={{ title: 'Exams' }} />
        <Tabs.Screen name="updates"  options={{ title: 'Updates' }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
        {/* Profile is reachable from the Home header avatar (not shown in the tab bar). */}
        <Tabs.Screen name="profile"  options={{ title: 'Profile' }} />
      </Tabs>
    </EdgeSwipeNavigator>
  )
}
