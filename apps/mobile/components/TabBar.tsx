// RN Image is fine for a tiny bundled asset; adding expo-image is a native module that would break OTA delivery.
// eslint-disable-next-line react-doctor/rn-prefer-expo-image
import { View, Text, Pressable, Image, StyleSheet } from 'react-native'
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
import { useKuyaChatModal } from '../providers/KuyaChatProvider'

const TAB_META: Record<string, { label: string; icon: typeof Home2Outlined }> = {
  index:     { label: 'Home',    icon: Home2Outlined },
  practice:  { label: 'Review',  icon: Bolt2Outlined },
  listings:  { label: 'Exams',   icon: GraduationCap1Outlined },
  updates:   { label: 'Updates', icon: Bell1Outlined },
}

// Two tabs on each side of the center "Ask Kuya Baw" button.
const LEFT_TABS = ['index', 'practice']
const RIGHT_TABS = ['listings', 'updates']

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
  const { open: openKuya } = useKuyaChatModal()

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
          backgroundColor: t.surface,
          borderTopColor: t.border,
          paddingBottom: insets.bottom,
          height: 62 + insets.bottom,
        },
      ]}
    >
      {LEFT_TABS.map(renderTab)}

      {/* Center "Ask Kuya Baw" — raised circular accent button (quick chat access) */}
      <View style={styles.centerSlot}>
        <Pressable
          onPress={openKuya}
          style={({ pressed }) => [styles.fab, { borderColor: t.surface }, pressed && { opacity: 0.88 }]}
          accessibilityRole="button"
          accessibilityLabel="Ask Kuya Baw"
        >
          <Image
            source={require('../assets/images/kuya-baw-mascot.png')}
            style={styles.fabImg}
            resizeMode="contain"
          />
        </Pressable>
      </View>

      {RIGHT_TABS.map(renderTab)}
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
  centerSlot: {
    width: 72,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  fab: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(128,0,0,0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    // Raise the circle so it pops above the bar's top edge (per the new layout).
    marginTop: -22,
    borderWidth: 4,
    boxShadow: '0px 4px 8px rgba(0,0,0,0.28)',
  },
  fabImg: { width: 42, height: 42 },
})
