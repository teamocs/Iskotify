import { View, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { fonts, radius, spacing, textStyle, type Theme } from '../../theme/tokens'

type Tone = 'accent' | 'neutral' | 'success' | 'warning' | 'danger'

/*
 * Tones name theme keys rather than literal colours, so the badge re-themes.
 * Status tones put the `*Strong` token on their own `*Surface` tint (DESIGN.md:
 * the DEFAULT status colour on its own 10% tint drops below 4.5:1 in light
 * mode). The label is required: a badge never carries meaning by colour alone.
 */
const TONES: Record<Tone, { bg: keyof Theme; fg: keyof Theme; border: keyof Theme }> = {
  accent:  { bg: 'accentSurface',  fg: 'accentText',    border: 'accentSurface' },
  neutral: { bg: 'surface2',       fg: 'textSecondary', border: 'surface2' },
  success: { bg: 'successSurface', fg: 'successStrong', border: 'successSurface' },
  warning: { bg: 'warningSurface', fg: 'warningStrong', border: 'warningSurface' },
  danger:  { bg: 'dangerSurface',  fg: 'dangerStrong',  border: 'dangerSurface' },
}

/** Small pill for tags/counts/status. */
export function Badge({ label, tone = 'accent' }: { label: string; tone?: Tone }) {
  const { theme: t } = useTheme()
  const c = TONES[tone]
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
      <Text style={[textStyle('caption', t[c.fg]), { fontFamily: fonts.bodySemi }]} maxFontSizeMultiplier={1.4}>{label}</Text>
    </View>
  )
}
