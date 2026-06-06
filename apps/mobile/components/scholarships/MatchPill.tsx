import { View, Text, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import type { MatchStatus } from '../../utils/scholarshipMatch'

interface MatchPillProps {
  status: MatchStatus
}

export function MatchPill({ status }: MatchPillProps) {
  const { typo } = useTheme()

  if (status === 'unknown') return null

  const config =
    status === 'eligible'
      ? { label: '✓ Eligible', bg: 'rgba(34,197,94,0.13)', border: 'rgba(34,197,94,0.30)', color: '#16a34a' }
      : status === 'maybe'
      ? { label: 'Maybe', bg: 'rgba(251,191,36,0.13)', border: 'rgba(251,191,36,0.35)', color: '#b45309' }
      : { label: 'Not eligible', bg: 'rgba(239,68,68,0.10)', border: 'rgba(239,68,68,0.25)', color: '#b91c1c' }

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
