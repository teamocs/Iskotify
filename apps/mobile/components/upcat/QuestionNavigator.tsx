import { useMemo } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'

interface Props {
  total: number
  currentIdx: number
  answeredIdxs: Set<number>
  onJump: (idx: number) => void
}
export function QuestionNavigator({ total, currentIdx, answeredIdxs, onJump }: Props) {
  const { theme: t, typo } = useTheme()
  const s = useMemo(() => StyleSheet.create({
    row: { paddingHorizontal: 12, paddingVertical: 8, gap: 6, flexDirection: 'row' },
    cell: { width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: t.border, backgroundColor: t.surface2 },
    cellAnswered: { backgroundColor: t.accentSurface, borderColor: t.accent },
    cellCurrent: { borderColor: t.accentText, borderWidth: 2 },
    num: { fontSize: typo.xs, fontWeight: '700', color: t.textSecondary, fontFamily: 'Lexend_600SemiBold' },
    numAnswered: { color: t.accentText },
  }), [t, typo])
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
      {Array.from({ length: total }, (_, i) => (
        <Pressable key={i} onPress={() => onJump(i)}
          style={[s.cell, answeredIdxs.has(i) && s.cellAnswered, i === currentIdx && s.cellCurrent]}
          accessibilityRole="button" accessibilityLabel={`Go to question ${i + 1}`}>
          <Text style={[s.num, answeredIdxs.has(i) && s.numAnswered]}>{i + 1}</Text>
        </Pressable>
      ))}
    </ScrollView>
  )
}
