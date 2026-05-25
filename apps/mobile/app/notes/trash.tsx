import { useMemo, useEffect } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
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
    Alert.alert('Empty Trash', 'Permanently delete all notes in trash?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete All', style: 'destructive', onPress: () => void emptyTrash() },
    ])
  }

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
    back: { padding: 8, marginRight: 8 },
    backTxt: { fontSize: typo.lg, color: t.textPrimary },
    screenTitle: { flex: 1, fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    emptyBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10, borderWidth: 1, borderColor: '#f87171' },
    emptyBtnTxt: { fontSize: typo.xs, color: '#f87171', fontFamily: 'Lexend_400Regular' },
    content: { paddingHorizontal: 12, paddingBottom: 40 },
    hint: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center', paddingVertical: 10 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    cardWrap: { width: '48%' },
    card: { borderRadius: 12, padding: 12, borderWidth: 1 },
    cardTitle: { fontSize: typo.sm, fontWeight: '700', fontFamily: 'Outfit_700Bold', marginBottom: 4 },
    cardContent: { fontSize: typo.xs, fontFamily: 'Lexend_400Regular', lineHeight: 16 },
    cardActions: { flexDirection: 'row', gap: 6, marginTop: 8, flexWrap: 'wrap' },
    actionBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border },
    actionTxt: { fontSize: typo.xs, color: t.textSecondary, fontFamily: 'Lexend_400Regular' },
    deleteBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8, borderWidth: 1, borderColor: '#f87171' },
    deleteTxt: { fontSize: typo.xs, color: '#f87171', fontFamily: 'Lexend_400Regular' },
    empty: { paddingVertical: 60, alignItems: 'center' },
    emptyTxt: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

  return (
    <SafeAreaView style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.topBar}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <Text style={s.backTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={s.screenTitle}>Trash</Text>
        {(notes as Note[]).length > 0 && (
          <TouchableOpacity style={s.emptyBtn} onPress={handleEmptyTrash}>
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
            <Text style={s.emptyTxt}>Trash is empty</Text>
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
                      <TouchableOpacity style={s.actionBtn} onPress={() => restoreNote(note.id)}>
                        <Text style={s.actionTxt}>Restore</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.deleteBtn} onPress={() => permanentlyDeleteNote(note.id)}>
                        <Text style={s.deleteTxt}>Delete forever</Text>
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
