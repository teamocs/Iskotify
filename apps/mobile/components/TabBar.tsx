import { View, Text, Pressable, Platform } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
// Type-only import for the custom tabBar prop; the app uses expo-router Tabs (JS navigator) by design.
// eslint-disable-next-line react-doctor/rn-no-non-native-navigator
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useTheme } from '../theme/ThemeContext'
import { fonts, layout, radius, spacing, textStyle } from '../theme/tokens'
import { useSafeInsets } from '../hooks/useSafeInsets'
import { TAB_DESTINATIONS, destinationForRoute, type Destination } from './navigation/destinations'

function NavItem({ dest, isFocused, onPress }: { dest: Destination; isFocused: boolean; onPress: () => void }) {
  const { theme: t } = useTheme()
  const color = isFocused ? t.accentText : t.textSecondary
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={dest.label}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 48,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {/* Active indicator: a pill behind the icon, so selection is shape + weight + colour. */}
      <View
        style={{
          width: 56,
          height: 28,
          borderRadius: radius.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isFocused ? t.accentSurface : 'transparent',
        }}
      >
        <Lineicons icon={dest.icon} size={22} color={color} />
      </View>
      <Text
        style={[textStyle('label', color), { fontFamily: isFocused ? fonts.heading : fonts.bodyMedium }]}
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
      >
        {dest.label}
      </Text>
    </Pressable>
  )
}

/**
 * Bottom navigation bar for phones and tablets: exactly the four destinations.
 * Legacy routes and Profile stay registered in the navigator (deep links) but
 * are not drawn; while a legacy route is focused its owner tab is highlighted.
 */
export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { theme: t } = useTheme()
  const insets = useSafeInsets()
  const focusedRoute = state.routes[state.index]
  const focusedDest = focusedRoute ? destinationForRoute(focusedRoute.name) : null
  const routeByName = new Map(state.routes.map(r => [r.name, r]))

  return (
    <View
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: layout.tabBarHeight + insets.bottom,
        paddingBottom: insets.bottom,
        backgroundColor: t.tabBar,
        borderTopWidth: 1,
        borderTopColor: t.border,
        alignItems: 'center',
      }}
    >
      <View
        testID="tab-bar-tablist"
        accessibilityRole="tablist"
        style={{
          flex: 1,
          width: '100%',
          // Tablets / mid-width web: keep the four targets together instead of
          // spreading them edge to edge across 800+ px.
          maxWidth: Platform.OS === 'web' ? 560 : undefined,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: spacing.xs,
        }}
      >
        {TAB_DESTINATIONS.map(dest => {
          const route = routeByName.get(dest.name)
          if (!route) return null
          const isFocused = focusedDest === dest.name
          const onPress = () => {
            const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true })
            if (focusedRoute?.key !== route.key && !event.defaultPrevented) navigation.navigate(route.name)
          }
          return <NavItem key={route.key} dest={dest} isFocused={isFocused} onPress={onPress} />
        })}
      </View>
    </View>
  )
}
