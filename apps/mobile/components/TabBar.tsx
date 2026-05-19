import React from 'react'
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
  BarChart4Outlined,
  User4Outlined,
} from '@lineiconshq/free-icons'
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs'

const TAB_META: Record<string, { label: string; icon: typeof Home2Outlined }> = {
  index:     { label: 'Home',      icon: Home2Outlined },
  practice:  { label: 'Practice',  icon: Bolt2Outlined },
  listings:  { label: 'Listings',  icon: GraduationCap1Outlined },
  analytics: { label: 'Analytics', icon: BarChart4Outlined },
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
      <Animated.View style={[styles.navItem, isFocused && styles.navItemActive, animStyle]}>
        <Lineicons
          icon={icon}
          size={20}
          color={isFocused ? '#fff' : 'rgba(255,255,255,0.62)'}
        />
        <Text style={[styles.navLabel, isFocused && styles.navLabelActive]}>
          {label}
        </Text>
      </Animated.View>
    </TouchableOpacity>
  )
}

export function TabBar({ state, navigation }: BottomTabBarProps) {
  return (
    <View style={styles.wrapper} pointerEvents="box-none">
      <BlurView intensity={90} tint="dark" style={styles.blur}>
        <View style={styles.inner}>
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
    bottom: 24,
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
    borderColor: 'rgba(255,255,255,0.28)',
  },
  inner: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  navItem: {
    alignItems: 'center',
    gap: 3,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 22,
  },
  navItemActive: {
    backgroundColor: 'rgba(128,0,0,0.82)',
  },
  navLabel: {
    fontSize: 9.5,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.62)',
    letterSpacing: 0.15,
  },
  navLabelActive: {
    color: '#fff',
    fontWeight: '700',
  },
})
