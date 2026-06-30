import { useMemo, useEffect } from 'react'
import { View, Text, Pressable, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Trash3Outlined, ArrowLeftOutlined, ArrowRightOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { useNotes, NOTE_COLORS, type Note } from '../../hooks/useNotes'
import { spacing, radius } from '../../theme/tokens'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { WebTopSpacer } from '../../components/ui/WebTopSpacer'

export default function TrashScreen() {
  const { theme: t, typo } = useTheme()
  const { notes, restoreNote, permanentlyDeleteNote, emptyTrash, pruneOldTrashedNotes } = useNotes('trashed')

  // Prune on mount
  useEffect(() => {
    void pruneOldTrashedNotes()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleEmptyTrash = () => {
    Alert.alert('Empty Trash', 'Permanently delete all notes in trash? This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete All', style: 'destructive', onPress: () => void emptyTrash() },
    ])
  }

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.sm, gap: spacing.sm },
    backBtn: { width: 44, height: 44, borderRadius: radius.pill, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
    screenTitle: { flex: 1, fontSize: typo.h2, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs + 2, minHeight: 44, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderRadius: radius.sm, borderCurve: 'continuous', borderWidth: 1, borderColor: 'rgba(248,113,113,0.4)', backgroundColor: 'rgba(248,113,113,0.07)' },
    emptyBtnTxt: { fontSize: typo.sm, color: '#f87171', fontFamily: 'Lexend_500Medium' },
    scroll: { paddingTop: spacing.xs, gap: spacing.md },
    hint: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', paddingBottom: spacing.xs },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    cardWrap: { width: '48%' },
    card: { borderRadius: radius.lg, borderCurve: 'continuous', padding: spacing.md, borderWidth: 1, boxShadow: t.shadowSm },
    cardTitle: { fontSize: typo.sm, fontWeight: '700', fontFamily: 'Outfit_700Bold', marginBottom: spacing.xs },
    cardContent: { fontSize: typo.xs, fontFamily: 'Lexend_400Regular', lineHeight: 16 },
    cardActions: { flexDirection: 'row', gap: spacing.xs + 2, marginTop: spacing.md },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xs + 1, minHeight: 44, paddingVertical: spacing.sm, borderRadius: radius.sm, borderCurve: 'continuous', backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border },
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
          style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
          onPress={() => router.back()}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Lineicons icon={ArrowLeftOutlined} size={18} color={t.textSecondary} />
        </Pressable>
        <Text style={s.screenTitle}>Trash</Text>
        {(notes as Note[]).length > 0 ? (
          <Pressable
            style={({ pressed }) => [s.emptyBtn, pressed && { opacity: 0.7 }]}
            onPress={handleEmptyTrash}
            accessibilityRole="button"
          >
            <Lineicons icon={Trash3Outlined} size={13} color="#f87171" />
            <Text style={s.emptyBtnTxt}>Empty</Text>
          </Pressable>
        ) : null}
      </View>
      <ScreenScroll tabBarInset={false} padded contentContainerStyle={s.scroll}>
        {(notes as Note[]).length > 0 ? (
          <Text style={s.hint}>Notes in trash are deleted after 7 days</Text>
        ) : null}
        {(notes as Note[]).length === 0 ? (
          <View style={s.empty}>
            <Lineicons icon={Trash3Outlined} size={36} color={t.textTertiary} />
            <Text style={[s.emptyTxt, { marginTop: spacing.md }]}>Trash is empty</Text>
          </View>
        ) : (
          // eslint-disable-next-line react-doctor/rn-no-scrollview-mapped-list
          <View style={s.grid}>
            {(notes as Note[]).map(note => {
              const bg = note.color ? NOTE_COLORS[note.color] : t.surface
              const textCol = note.color ? '#2d0a0a' : t.textPrimary
              return (
                <View key={note.id} style={s.cardWrap}>
                  <View style={[s.card, { backgroundColor: bg, borderColor: note.color ? 'rgba(0,0,0,0.1)' : t.border }]}>
                    {note.title.length > 0 ? (
                      <Text style={[s.cardTitle, { color: textCol }]} numberOfLines={2}>{note.title}</Text>
                    ) : null}
                    {note.type === 'text' && note.content.length > 0 ? (
                      <Text style={[s.cardContent, { color: note.color ? 'rgba(45,10,10,0.6)' : t.textSecondary }]} numberOfLines={3}>{note.content}</Text>
                    ) : null}
                    <View style={s.cardActions}>
                      <Pressable
                        style={({ pressed }) => [s.actionBtn, pressed && { opacity: 0.7 }]}
                        onPress={() => void restoreNote(note.id)}
                        accessibilityRole="button"
                      >
                        <Lineicons icon={ArrowRightOutlined} size={13} color={t.textSecondary} />
                        <Text style={s.actionTxt}>Restore</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [s.actionBtn, s.dangerBtn, pressed && { opacity: 0.7 }]}
                        onPress={() => void permanentlyDeleteNote(note.id)}
                        accessibilityRole="button"
                      >
                        <Lineicons icon={Trash3Outlined} size={13} color="#f87171" />
                        <Text style={[s.actionTxt, s.dangerTxt]}>Delete</Text>
                      </Pressable>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </ScreenScroll>
    </SafeAreaView>
  )
}
