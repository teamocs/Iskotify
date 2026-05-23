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
        <Tabs.Screen name="practice" options={{ title: 'Practice' }} />
        <Tabs.Screen name="listings"  options={{ title: 'Listings' }} />
        <Tabs.Screen name="analytics" options={{ title: 'Analytics' }} />
        <Tabs.Screen name="profile"   options={{ title: 'Profile' }} />
      </Tabs>
    </EdgeSwipeNavigator>
  )
}
