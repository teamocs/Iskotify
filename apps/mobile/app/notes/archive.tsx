import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { BoxArchive1Outlined, Trash3Outlined, ArrowLeftOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { useNotes, NOTE_COLORS, type Note } from '../../hooks/useNotes'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { Card } from '../../components/ui/Card'
import { WebTopSpacer } from '../../components/ui/WebTopSpacer'
import { spacing, radius } from '../../theme/tokens'

export default function ArchiveScreen() {
  const { theme: t, typo } = useTheme()
  const { notes, unarchiveNote, deleteNote } = useNotes('archived')

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.sm },
    backBtn: { width: 44, height: 44, borderRadius: radius.md, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
    backBtnPressed: { opacity: 0.7 },
    topBarTitle: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginLeft: spacing.xs },
    header: { marginTop: spacing.sm, marginBottom: spacing.lg },
    pageTitle: { fontSize: typo.h2, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    subtitle: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: spacing.xs },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
    cardWrap: { width: '48%' },
    card: { padding: spacing.md, borderRadius: radius.lg },
    cardTitle: { fontSize: typo.sm, fontWeight: '700', fontFamily: 'Outfit_700Bold', marginBottom: spacing.xs },
    cardContent: { fontSize: typo.xs, fontFamily: 'Lexend_400Regular', lineHeight: 16 },
    cardActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.md },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs, paddingVertical: spacing.sm, borderRadius: radius.sm, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border },
    actionBtnPressed: { opacity: 0.7 },
    actionTxt: { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_500Medium' },
    dangerBtn: { borderColor: 'rgba(248,113,113,0.35)', backgroundColor: 'rgba(248,113,113,0.07)' },
    dangerTxt: { color: '#f87171' },
    empty: { paddingVertical: 60, alignItems: 'center' },
    emptyTxt: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

  return (
    <SafeAreaView style={s.root}>
      <WebTopSpacer />
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.topBar}>
        <Pressable
          style={({ pressed }) => [s.backBtn, pressed ? s.backBtnPressed : null]}
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Lineicons icon={ArrowLeftOutlined} size={18} color={t.textSecondary} />
        </Pressable>
        <Text style={s.topBarTitle}>Archive</Text>
      </View>
      <ScreenScroll tabBarInset={false} padded>
        <View style={s.header}>
          <Text style={s.pageTitle}>Archive</Text>
          <Text style={s.subtitle}>Notes you have set aside</Text>
        </View>
        {(notes as Note[]).length === 0 ? (
          <View style={s.empty}>
            <Lineicons icon={BoxArchive1Outlined} size={36} color={t.textTertiary} />
            <Text style={[s.emptyTxt, { marginTop: spacing.md }]}>No archived notes</Text>
          </View>
        ) : (
          <View style={s.grid}>
            {(notes as Note[]).map(note => {
              const bg = note.color ? NOTE_COLORS[note.color] : t.surface
              const textCol = note.color ? '#2d0a0a' : t.textPrimary
              return (
                <View key={note.id} style={s.cardWrap}>
                  <Card elevated padded={false} style={[s.card, { backgroundColor: bg, borderColor: note.color ? 'rgba(0,0,0,0.1)' : t.border }]}>
                    {note.title.length > 0 ? (
                      <Text style={[s.cardTitle, { color: textCol }]} numberOfLines={2}>{note.title}</Text>
                    ) : null}
                    {note.type === 'text' && note.content.length > 0 ? (
                      <Text style={[s.cardContent, { color: note.color ? 'rgba(45,10,10,0.6)' : t.textSecondary }]} numberOfLines={3}>{note.content}</Text>
                    ) : null}
                    <View style={s.cardActions}>
                      <Pressable
                        style={({ pressed }) => [s.actionBtn, pressed ? s.actionBtnPressed : null]}
                        onPress={() => void unarchiveNote(note.id)}
                        accessibilityRole="button"
                        accessibilityLabel="Unarchive note"
                      >
                        <Lineicons icon={BoxArchive1Outlined} size={13} color={t.textSecondary} />
                        <Text style={s.actionTxt}>Unarchive</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [s.actionBtn, s.dangerBtn, pressed ? s.actionBtnPressed : null]}
                        onPress={() => void deleteNote(note.id)}
                        accessibilityRole="button"
                        accessibilityLabel="Move note to trash"
                      >
                        <Lineicons icon={Trash3Outlined} size={13} color="#f87171" />
                        <Text style={[s.actionTxt, s.dangerTxt]}>Trash</Text>
                      </Pressable>
                    </View>
                  </Card>
                </View>
              )
            })}
          </View>
        )}
      </ScreenScroll>
    </SafeAreaView>
  )
}
