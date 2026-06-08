import { Tabs } from 'expo-router'
import { TabBar } from '../../components/TabBar'
import { EdgeSwipeNavigator } from '../../components/EdgeSwipeNavigator'

export default function TabLayout() {
  return (
    <EdgeSwipeNavigator>
      <Tabs
        tabBar={(props) => <TabBar {...props} />}
        screenOptions={{ headerShown: false, animation: 'shift' }}
      >
        <Tabs.Screen name="index" options={{ title: 'Home' }} />
        <Tabs.Screen name="practice" options={{ title: 'Review' }} />
        <Tabs.Screen name="listings"  options={{ title: 'Exams' }} />
        <Tabs.Screen name="updates"   options={{ title: 'Updates' }} />
        <Tabs.Screen name="analytics" options={{ href: null }} />
        {/* Profile is reachable from the Home header avatar (not shown in the tab bar). */}
        <Tabs.Screen name="profile"   options={{ title: 'Profile' }} />
      </Tabs>
    </EdgeSwipeNavigator>
  )
}
