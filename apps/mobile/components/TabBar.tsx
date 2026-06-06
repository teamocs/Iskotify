import React, { useMemo } from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
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
  User4Outlined,
} from '@lineiconshq/free-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { useTheme } from '../theme/ThemeContext'

const TAB_META: Record<string, { label: string; icon: typeof Home2Outlined }> = {
  index:     { label: 'Home',      icon: Home2Outlined },
  practice:  { label: 'Practice',  icon: Bolt2Outlined },
  listings:  { label: 'Listings',  icon: GraduationCap1Outlined },
  updates:   { label: 'Updates',   icon: Bell1Outlined },
  profile:   { label: 'Profile',   icon: User4Outlined },
}

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
    navItem: { alignItems: 'center', gap: 3, paddingVertical: 7, paddingHorizontal: 11, borderRadius: 22 },
    navItemActive: { backgroundColor: 'rgba(128,0,0,0.82)' },
    navLabel: { fontSize: typo.xs, fontWeight: '500', color: t.textSecondary, letterSpacing: 0.15 },
    navLabelActive: { color: '#fff', fontWeight: '700' },
  }), [t, typo])

  const scale = useSharedValue(isFocused ? 1.06 : 1)

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }))

  React.useEffect(() => {
    scale.value = withSpring(isFocused ? 1.06 : 1, { damping: 12, stiffness: 200 })
  }, [isFocused])

  function handlePressIn() {
    scale.value = withSpring(0.9, { damping: 12, stiffness: 200 })
  }
  function handlePressOut() {
    scale.value = withSpring(isFocused ? 1.06 : 1, { damping: 12, stiffness: 200 })
  }

  return (
    <TouchableOpacity
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      activeOpacity={1}
    >
      <Animated.View style={[ns.navItem, isFocused && ns.navItemActive, animStyle]}>
        <Lineicons
          icon={icon}
          size={20}
          color={isFocused ? '#fff' : t.textSecondary}
        />
        <Text style={[ns.navLabel, isFocused && ns.navLabelActive]}>
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  )
}

export function TabBar({ state, navigation }: BottomTabBarProps) {
  const { theme: t, isDark } = useTheme()
  const insets = useSafeAreaInsets()

  return (
    <View style={[styles.wrapper, { bottom: insets.bottom + 20 }]} pointerEvents="box-none">
      <BlurView intensity={90} tint={isDark ? 'dark' : 'light'} style={[styles.blur, { borderColor: t.border }]}>
        <View style={[styles.inner, { backgroundColor: isDark ? 'rgba(255,255,255,0.16)' : 'rgba(128,0,0,0.04)' }]}>
          {state.routes.map((route, idx) => {
            const meta = TAB_META[route.name]
            if (!meta) return null
            const isFocused = state.index === idx

            function onPress() {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              })
              if (!isFocused && !event.defaultPrevented) {
                navigation.navigate(route.name)
              }
            }

            return (
              <NavItem
                key={route.key}
                label={meta.label}
                icon={meta.icon}
                isFocused={isFocused}
                onPress={onPress}
              />
            )
          })}
        </View>
      </BlurView>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  blur: {
    width: 340,
    height: 68,
    borderRadius: 36,
    overflow: 'hidden',
    borderWidth: 1,
  },
  inner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
  },
})
