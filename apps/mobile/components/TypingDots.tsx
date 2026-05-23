import { useEffect } from 'react'
import { StyleSheet, View } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated'
import { useTheme } from '../theme/ThemeContext'

interface DotProps {
  delay: number
  color: string
}

function Dot({ delay, color }: DotProps) {
  const opacity = useSharedValue(0.3)

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 }),
          withTiming(0.3, { duration: 600 }),
        ),
        -1,
        false,
      ),
    )
  }, [delay, opacity])

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }))

  return <Animated.View style={[styles.dot, { backgroundColor: color }, animatedStyle]} />
}

export function TypingDots() {
  const { theme: t } = useTheme()

  return (
    <View style={styles.row} accessibilityLabel="Kuya Baw is typing">
      <Dot delay={0} color={t.textSecondary} />
      <Dot delay={200} color={t.textSecondary} />
      <Dot delay={400} color={t.textSecondary} />
    </View>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
})
