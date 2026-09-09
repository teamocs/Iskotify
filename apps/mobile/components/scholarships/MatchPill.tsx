import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import type { MatchStatus } from '../../utils/scholarshipMatch'

interface MatchPillProps {
  status: MatchStatus
}

export function MatchPill({ status }: MatchPillProps) {
  const { theme: t, typo } = useTheme()

  if (status === 'unknown') return null

  const config =
    status === 'eligible'
      ? { label: '✓ Eligible', bg: t.successSurface, border: t.successSurface, color: t.success }
      : status === 'maybe'
      ? { label: 'Maybe', bg: t.warningSurface, border: t.warningSurface, color: t.warning }
      : { label: 'Not eligible', bg: t.dangerSurface, border: t.dangerSurface, color: t.danger }

  return (
    <View style={[s.pill, { backgroundColor: config.bg, borderColor: config.border }]}>
      <Text style={[s.txt, { fontSize: typo.xs, color: config.color }]}>{config.label}</Text>
    </View>
  )
}

const s = StyleSheet.create({
  pill: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    flexShrink: 0,
  },
  txt: {
    fontWeight: '700',
    fontFamily: 'Lexend_600SemiBold',
  },
})
