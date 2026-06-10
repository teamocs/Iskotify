import { View, Text } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing } from '../../theme/tokens'

type Tone = 'accent' | 'neutral' | 'success' | 'warning' | 'danger'

const TONES: Record<Tone, { bg: string; fg: string; border: string }> = {
  accent:  { bg: 'rgba(128,0,0,0.12)',  fg: '', border: 'rgba(128,0,0,0.28)' },
  neutral: { bg: 'rgba(128,128,128,0.14)', fg: '', border: 'rgba(128,128,128,0.28)' },
  success: { bg: 'rgba(34,197,94,0.14)', fg: '#16a34a', border: 'rgba(34,197,94,0.30)' },
  warning: { bg: 'rgba(245,158,11,0.14)', fg: '#b45309', border: 'rgba(245,158,11,0.30)' },
  danger:  { bg: 'rgba(239,68,68,0.14)', fg: '#dc2626', border: 'rgba(239,68,68,0.30)' },
}

/** Small pill for tags/counts/status (design system §4). */
export function Badge({ label, tone = 'accent' }: { label: string; tone?: Tone }) {
  const { theme: t, typo } = useTheme()
  const c = TONES[tone]
  const fg = c.fg || t.accentText
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        backgroundColor: c.bg,
        borderWidth: 1,
        borderColor: c.border,
        borderRadius: radius.pill,
        paddingHorizontal: spacing.sm,
        paddingVertical: 2,
      }}
    >
      <Text style={{ fontSize: typo.xs, fontWeight: '700', color: fg, fontFamily: 'Lexend_600SemiBold' }} maxFontSizeMultiplier={1.4}>{label}</Text>
    </View>
  )
}
