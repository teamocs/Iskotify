import { View } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, type Theme } from '../../theme/tokens'

interface Props {
  /** 0–1. Clamped. */
  value: number
  /** Accessible name, e.g. "Science readiness". Required: a bar alone says nothing. */
  label: string
  tone?: 'accent' | 'success' | 'warning' | 'danger'
  height?: number
}

const FILL: Record<NonNullable<Props['tone']>, keyof Theme> = {
  // accentText rather than accent: a readable fill in dark mode (5.86:1 on the
  // track) and still maroon-family in light (9.73:1 accent on the track).
  accent: 'accentText', success: 'success', warning: 'warning', danger: 'danger',
}

/** Linear progress. Pair with visible text (StatNumber / caption) for the value. */
export function ProgressBar({ value, label, tone = 'accent', height = 6 }: Props) {
  const { theme: t } = useTheme()
  const pct = Math.round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 100)
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: pct }}
      style={{ height, borderRadius: radius.pill, backgroundColor: t.surface2, overflow: 'hidden' }}
    >
      <View style={{ width: `${pct}%`, height: '100%', borderRadius: radius.pill, backgroundColor: t[FILL[tone]] }} />
    </View>
  )
}
