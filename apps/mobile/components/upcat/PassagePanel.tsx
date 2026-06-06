import { useState, useMemo } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'

export function PassagePanel({ passage }: { passage: string }) {
  const { theme: t, typo } = useTheme()
  const [expanded, setExpanded] = useState(true)
  const s = useMemo(() => StyleSheet.create({
    wrap: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 16, marginHorizontal: 14, marginBottom: 10, overflow: 'hidden' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 10 },
    title: { fontSize: typo.xs, fontWeight: '700', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Lexend_600SemiBold' },
    chev: { color: t.textSecondary, fontSize: 16 },
    body: { paddingHorizontal: 14, paddingBottom: 12, maxHeight: 220 },
    text: { fontSize: typo.sm, color: t.textSecondary, lineHeight: 21, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])
  return (
    <View style={s.wrap}>
      <Pressable style={s.header} onPress={() => setExpanded(e => !e)} accessibilityRole="button" accessibilityLabel="Toggle passage">
        <Text style={s.title}>📄 Passage</Text>
        <Text style={s.chev}>{expanded ? '▾' : '▸'}</Text>
      </Pressable>
      {expanded && (
        <ScrollView style={s.body} nestedScrollEnabled><Text style={s.text}>{passage}</Text></ScrollView>
      )}
    </View>
  )
}
