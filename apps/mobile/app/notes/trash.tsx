import { useMemo, useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Trash3Outlined, ArrowLeftOutlined, ArrowRightOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { useNotes, NOTE_COLORS, type Note } from '../../hooks/useNotes'

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
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    backBtn: { width: 36, height: 36, borderRadius: 12, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
    screenTitle: { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginLeft: 4 },
    emptyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 10, borderWidth: 1, borderColor: 'rgba(248,113,113,0.4)', backgroundColor: 'rgba(248,113,113,0.07)' },
    emptyBtnTxt: { fontSize: typo.xs, color: '#f87171', fontFamily: 'Lexend_500Medium' },
    content: { paddingHorizontal: 12, paddingBottom: 40 },
    hint: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', paddingVertical: 10 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    cardWrap: { width: '48%' },
    card: { borderRadius: 12, padding: 12, borderWidth: 1 },
    cardTitle: { fontSize: typo.sm, fontWeight: '700', fontFamily: 'Outfit_700Bold', marginBottom: 4 },
    cardContent: { fontSize: typo.xs, fontFamily: 'Lexend_400Regular', lineHeight: 16 },
    cardActions: { flexDirection: 'row', gap: 6, marginTop: 10 },
    actionBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 8, borderRadius: 10, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border },
    actionTxt: { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_500Medium' },
    dangerBtn: { borderColor: 'rgba(248,113,113,0.35)', backgroundColor: 'rgba(248,113,113,0.07)' },
    dangerTxt: { color: '#f87171' },
    empty: { paddingVertical: 60, alignItems: 'center' },
    emptyTxt: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

  return (
    <SafeAreaView style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.topBar}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Lineicons icon={ArrowLeftOutlined} size={18} color={t.textSecondary} />
        </TouchableOpacity>
        <Text style={s.screenTitle}>Trash</Text>
        {(notes as Note[]).length > 0 && (
          <TouchableOpacity style={s.emptyBtn} onPress={handleEmptyTrash}>
            <Lineicons icon={Trash3Outlined} size={13} color="#f87171" />
            <Text style={s.emptyBtnTxt}>Empty</Text>
          </TouchableOpacity>
        )}
      </View>
      <ScrollView contentContainerStyle={s.content}>
        {(notes as Note[]).length > 0 && (
          <Text style={s.hint}>Notes in trash are deleted after 7 days</Text>
        )}
        {(notes as Note[]).length === 0 ? (
          <View style={s.empty}>
            <Lineicons icon={Trash3Outlined} size={36} color={t.textTertiary} />
            <Text style={[s.emptyTxt, { marginTop: 12 }]}>Trash is empty</Text>
          </View>
        ) : (
          <View style={s.grid}>
            {(notes as Note[]).map(note => {
              const bg = note.color ? NOTE_COLORS[note.color] : t.surface
              const textCol = note.color ? '#2d0a0a' : t.textPrimary
              return (
                <View key={note.id} style={s.cardWrap}>
                  <View style={[s.card, { backgroundColor: bg, borderColor: note.color ? 'rgba(0,0,0,0.1)' : t.border }]}>
                    {note.title.length > 0 && (
                      <Text style={[s.cardTitle, { color: textCol }]} numberOfLines={2}>{note.title}</Text>
                    )}
                    {note.type === 'text' && note.content.length > 0 && (
                      <Text style={[s.cardContent, { color: note.color ? 'rgba(45,10,10,0.6)' : t.textSecondary }]} numberOfLines={3}>{note.content}</Text>
                    )}
                    <View style={s.cardActions}>
                      <TouchableOpacity style={s.actionBtn} onPress={() => void restoreNote(note.id)}>
                        <Lineicons icon={ArrowRightOutlined} size={13} color={t.textSecondary} />
                        <Text style={s.actionTxt}>Restore</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.actionBtn, s.dangerBtn]} onPress={() => void permanentlyDeleteNote(note.id)}>
                        <Lineicons icon={Trash3Outlined} size={13} color="#f87171" />
                        <Text style={[s.actionTxt, s.dangerTxt]}>Delete</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )
            })}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  )
}
