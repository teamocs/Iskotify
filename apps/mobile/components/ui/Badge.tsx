import { View, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, type Theme } from '../../theme/tokens'

type Tone = 'accent' | 'neutral' | 'success' | 'warning' | 'danger'

/*
 * Tones name theme keys rather than literal colours. The previous literals were
 * the dark palette's values, so a success badge rendered mint-on-white in light
 * mode (1.7:1). Resolving against the live theme is what makes the badge switch.
 */
const TONES: Record<Tone, { bg: keyof Theme; fg: keyof Theme; border: keyof Theme }> = {
  accent:  { bg: 'accentSurface',  fg: 'accentText', border: 'border' },
  neutral: { bg: 'surface2',       fg: 'textSecondary', border: 'divider' },
  success: { bg: 'successSurface', fg: 'success', border: 'successSurface' },
  warning: { bg: 'warningSurface', fg: 'warning', border: 'warningSurface' },
  danger:  { bg: 'dangerSurface',  fg: 'danger',  border: 'dangerSurface' },
}

/** Small pill for tags/counts/status (design system §4). */
export function Badge({ label, tone = 'accent' }: { label: string; tone?: Tone }) {
  const { theme: t, typo } = useTheme()
  const c = TONES[tone]
  const fg = t[c.fg]
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: t[c.bg],
        borderWidth: 1,
        borderColor: t[c.border],
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
      }}
    >
      <Text style={{ fontSize: typo.xs, fontWeight: '700', color: fg, fontFamily: 'Lexend_600SemiBold' }} maxFontSizeMultiplier={1.4}>{label}</Text>
    </View>
  )
}
