import { View, Text } from 'react-native'
import Svg, { Circle } from 'react-native-svg'
import { useTheme } from '../../theme/ThemeContext'

interface Props {
  /** 0-1. Values outside the range are clamped. */
  progress: number
  size?: number
  strokeWidth?: number
  /** Centered label, e.g. "2/4". Omit for a bare ring. */
  label?: string
  color?: string
  trackColor?: string
}

/** Small circular progress indicator (react-native-svg — already a dependency). */
export function ProgressRing({ progress, size = 40, strokeWidth = 4, label, color, trackColor }: Props) {
  const { theme: t, typo } = useTheme()
  const clamped = Math.max(0, Math.min(1, progress))
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const dashOffset = circumference * (1 - clamped)
  const ringColor = color ?? t.success
  const bgColor = trackColor ?? t.surfaceSubtle

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={bgColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={ringColor}
          strokeWidth={strokeWidth}
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={dashOffset}
          strokeLinecap="round"
          fill="none"
          // Rotate so progress starts at 12 o'clock instead of 3 o'clock.
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      {label ? (
        <Text style={{ fontSize: typo.xs, fontWeight: '700', color: t.textPrimary, fontFamily: 'Lexend_600SemiBold' }} maxFontSizeMultiplier={1.2}>
          {label}
        </Text>
      ) : null}
    </View>
  )
}
