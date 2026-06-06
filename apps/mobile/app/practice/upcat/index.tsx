import { useEffect, useState, useMemo } from 'react'
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { router } from 'expo-router'
import { useDb } from '../../../hooks/useDb'
import { upcatQuestions } from '../../../db/schema'
import { SUBTESTS } from '../../../utils/upcatExam'
import { useTheme } from '../../../theme/ThemeContext'

export default function UpcatHome() {
  const db = useDb()
  const { theme: t, typo } = useTheme()
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [picker, setPicker] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const rows = await db.select({ subtest: upcatQuestions.subtest }).from(upcatQuestions)
      const c: Record<string, number> = {}
      for (const r of rows) c[r.subtest] = (c[r.subtest] ?? 0) + 1
      setCounts(c)
    })()
  }, [db])

  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
    title: { fontSize: typo.xl, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    sub: { fontSize: typo.xs, color: t.textTertiary, marginTop: 2, fontFamily: 'Lexend_400Regular' },
    card: { backgroundColor: t.surface2, borderWidth: 1, borderColor: t.divider, borderRadius: 18, padding: 16, marginHorizontal: 16, marginBottom: 10 },
    cardMock: { backgroundColor: t.accentSurface, borderColor: 'rgba(128,0,0,0.30)' },
    cardTitle: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    cardSub: { fontSize: typo.sm, color: t.textTertiary, marginTop: 2, fontFamily: 'Lexend_400Regular' },
    sheet: { position: 'absolute', left: 0, right: 0, bottom: 0, backgroundColor: t.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, borderTopWidth: 1, borderColor: t.border, gap: 10 },
    sheetTitle: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    choice: { borderRadius: 14, padding: 14, borderWidth: 1, borderColor: t.border, backgroundColor: t.surface2 },
    choiceTitle: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary },
    choiceSub: { fontSize: typo.xs, color: t.textTertiary, marginTop: 2 },
    overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.4)' },
  }), [t, typo])

  function go(mode: 'quick' | 'full') {
    if (!picker) return
    const subtest = picker
    setPicker(null)
    router.push(`/practice/upcat/${encodeURIComponent(subtest)}?mode=${mode}`)
  }

  return (
    <SafeAreaView style={s.root}>
      <View style={s.header}>
        <Text style={s.title}>UPCAT Mock Exam</Text>
        <Text style={s.sub}>{total} authored questions · choose a subtest or the full mock</Text>
      </View>
      <ScrollView contentContainerStyle={{ paddingVertical: 8, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
        <Pressable style={[s.card, s.cardMock]} onPress={() => setPicker('all')}>
          <Text style={s.cardTitle}>🎯 Full Mock Exam</Text>
          <Text style={s.cardSub}>All {total} questions across 4 subtests</Text>
        </Pressable>
        {SUBTESTS.map(st => (
          <Pressable key={st} style={s.card} onPress={() => setPicker(st)}>
            <Text style={s.cardTitle}>{st}</Text>
            <Text style={s.cardSub}>{counts[st] ?? 0} questions</Text>
          </Pressable>
        ))}
      </ScrollView>

      {picker && (
        <>
          <Pressable style={s.overlay} onPress={() => setPicker(null)} />
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>{picker === 'all' ? 'Full Mock' : picker}</Text>
            <Pressable style={s.choice} onPress={() => go('quick')}>
              <Text style={s.choiceTitle}>Quick</Text>
              <Text style={s.choiceSub}>~15 sampled questions</Text>
            </Pressable>
            <Pressable style={s.choice} onPress={() => go('full')}>
              <Text style={s.choiceTitle}>Full</Text>
              <Text style={s.choiceSub}>{picker === 'all' ? `All ${total} questions` : `All ${counts[picker] ?? 0} questions`}</Text>
            </Pressable>
          </View>
        </>
      )}
    </SafeAreaView>
  )
}
