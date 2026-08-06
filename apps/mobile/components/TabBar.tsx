import { View, Text, Pressable, StyleSheet } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  Home2Outlined,
  Bolt2Outlined,
  GraduationCap1Outlined,
  Bell1Outlined,
} from '@lineiconshq/free-icons'
// Type-only import for the custom tabBar prop; the app uses expo-router Tabs (JS navigator) by design.
// eslint-disable-next-line react-doctor/rn-no-non-native-navigator
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme/ThemeContext'

const TAB_META: Record<string, { label: string; icon: typeof Home2Outlined }> = {
  index:     { label: 'Home',    icon: Home2Outlined },
  practice:  { label: 'Exams',   icon: Bolt2Outlined },
  listings:  { label: 'Lists',   icon: GraduationCap1Outlined },
  updates:   { label: 'Updates', icon: Bell1Outlined },
}

const TABS = ['index', 'practice', 'listings', 'updates']

function NavItem({
  label,
  icon,
  isFocused,
  onPress,
}: {
  label: string
  icon: typeof Home2Outlined
  isFocused: boolean
  onPress: () => void
}) {
  const { theme: t } = useTheme()
  const color = isFocused ? t.accentText : t.textTertiary
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.item, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
      accessibilityState={{ selected: isFocused }}
      accessibilityLabel={label}
    >
      <Lineicons icon={icon} size={22} color={color} />
      <Text style={[styles.label, { color, fontWeight: isFocused ? '700' : '500' }]}>{label}</Text>
    </Pressable>
  )
}

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { theme: t } = useTheme()
  const insets = useSafeAreaInsets()

  const routeByName = new Map(state.routes.map(r => [r.name, r]))

  const renderTab = (name: string) => {
    const route = routeByName.get(name)
    const meta = TAB_META[name]
    if (!route || !meta) return null
    const routeIndex = state.routes.findIndex(r => r.key === route.key)
    const isFocused = state.index === routeIndex

    function onPress() {
      const event = navigation.emit({ type: 'tabPress', target: route!.key, canPreventDefault: true })
      if (!isFocused && !event.defaultPrevented) navigation.navigate(route!.name)
    }

    return <NavItem key={route.key} label={meta.label} icon={meta.icon} isFocused={isFocused} onPress={onPress} />
  }

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: t.tabBar,
          borderTopColor: t.border,
          paddingBottom: insets.bottom,
          height: 62 + insets.bottom,
        },
      ]}
    >
      {TABS.map(renderTab)}
    </View>
  )
}

const styles = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    borderTopWidth: 1,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 6,
    // Lift the bar visually off the content above it (cross-platform on new arch).
    boxShadow: '0px -3px 12px rgba(0,0,0,0.10)',
  },
  item: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingTop: 6,
  },
  label: {
    fontSize: 11,
    fontFamily: 'Outfit_600SemiBold',
    letterSpacing: 0.1,
  },
})
