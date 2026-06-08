import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, Image, StyleSheet } from 'react-native'
import { BlurView } from 'expo-blur'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  Home2Outlined,
  Bolt2Outlined,
  GraduationCap1Outlined,
  Bell1Outlined,
} from '@lineiconshq/free-icons'
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

// Display order around the center floating "Ask Kuya Baw" button.
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
  const { theme: t, typo } = useTheme()
  const ns = useMemo(() => StyleSheet.create({
    navItem: { alignItems: 'center', gap: 3, paddingVertical: 7, paddingHorizontal: 9, borderRadius: 22 },
    navItemActive: { backgroundColor: 'rgba(128,0,0,0.82)' },
    navLabel: { fontSize: typo.xs, fontWeight: '500', color: t.textSecondary, letterSpacing: 0.15 },
    navLabelActive: { color: '#fff', fontWeight: '700' },
  }), [t, typo])

  const scale = useSharedValue(isFocused ? 1.06 : 1)
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  React.useEffect(() => {
    scale.value = withSpring(isFocused ? 1.06 : 1, { damping: 12, stiffness: 200 })
  }, [isFocused])

  function handlePressIn() { scale.value = withSpring(0.9, { damping: 12, stiffness: 200 }) }
  function handlePressOut() { scale.value = withSpring(isFocused ? 1.06 : 1, { damping: 12, stiffness: 200 }) }

  return (
    <TouchableOpacity onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} activeOpacity={1}>
      <Animated.View style={[ns.navItem, isFocused && ns.navItemActive, animStyle]}>
        <Lineicons icon={icon} size={20} color={isFocused ? '#fff' : t.textSecondary} />
        <Text style={[ns.navLabel, isFocused && ns.navLabelActive]}>{label}</Text>
      </Animated.View>
    </TouchableOpacity>
  )
}

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { theme: t, isDark } = useTheme()
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
    <View style={[styles.wrapper, { bottom: insets.bottom + 20 }]} pointerEvents="box-none">
      <BlurView intensity={90} tint={isDark ? 'dark' : 'light'} style={[styles.blur, { borderColor: t.border }]}>
        <View style={[styles.inner, { backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(128,0,0,0.04)' }]}>
          {LEFT_TABS.map(renderTab)}
          <View style={styles.centerGap} />
          {RIGHT_TABS.map(renderTab)}
        </View>
      </BlurView>

      {/* Center floating "Ask Kuya Baw" — quick access to the Kuya Baw chat */}
      <TouchableOpacity
        style={styles.fab}
        onPress={openKuya}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel="Ask Kuya Baw"
      >
        <View style={[styles.fabCircle, { borderColor: t.bg }]}>
          <Image
            source={require('../assets/images/kuya-baw-mascot.png')}
            style={styles.fabImg}
            resizeMode="contain"
          />
        </View>
        <Text style={[styles.fabLabel, { color: t.textSecondary }]}>Ask Kuya Baw</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  blur: { width: 340, height: 68, borderRadius: 36, overflow: 'hidden', borderWidth: 1 },
  inner: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingHorizontal: 10 },
  centerGap: { width: 60 },
  fab: { position: 'absolute', left: 0, right: 0, top: -22, alignItems: 'center', zIndex: 20 },
  fabCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(128,0,0,0.95)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 3,
    shadowColor: '#000', shadowOpacity: 0.28, shadowRadius: 8, shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  fabImg: { width: 44, height: 44 },
  fabLabel: { marginTop: 2, fontSize: 9, fontWeight: '700', fontFamily: 'Outfit_700Bold', letterSpacing: 0.1 },
})
