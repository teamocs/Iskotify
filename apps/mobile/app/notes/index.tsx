import { useState, useMemo, useCallback } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Pressable, Alert,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { useNotes, NOTE_COLORS, type Note, type NoteType } from '../../hooks/useNotes'
import { EdgeSwipeNavigator } from '../../components/EdgeSwipeNavigator'

function NoteCard({
  note,
  onPress,
  onLongPress,
  selected,
}: {
  note: Note
  onPress: () => void
  onLongPress: () => void
  selected: boolean
}) {
  const { theme: t, typo } = useTheme()
  const bg = note.color ? NOTE_COLORS[note.color] : t.surface
  const textColor = note.color ? '#2d0a0a' : t.textPrimary
  const subColor = note.color ? 'rgba(45,10,10,0.6)' : t.textSecondary

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        {
          backgroundColor: bg,
          borderRadius: 12,
          padding: 12,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? '#800000' : (note.color ? 'rgba(0,0,0,0.1)' : t.border),
          flex: 1,
        },
      ]}
    >
      {note.isPinned && (
        <Text style={{ fontSize: 10, color: subColor, marginBottom: 4 }}>📌 Pinned</Text>
      )}
      {note.title.length > 0 && (
        <Text
          style={{ fontSize: typo.sm, fontWeight: '700', color: textColor, fontFamily: 'Outfit_700Bold', marginBottom: 4 }}
          numberOfLines={2}
        >
          {note.title}
        </Text>
      )}
      {note.type === 'text' && note.content.length > 0 && (
        <Text
          style={{ fontSize: typo.xs, color: subColor, fontFamily: 'Lexend_400Regular', lineHeight: 16 }}
          numberOfLines={4}
        >
          {note.content}
        </Text>
      )}
      {note.type === 'checklist' && (() => {
        try {
          const items = JSON.parse(note.content) as Array<{ text: string; isChecked: boolean }>
          return (
            <View style={{ gap: 3 }}>
              {items.slice(0, 5).map((item, i) => (
                <Text key={i} style={{ fontSize: typo.xs, color: item.isChecked ? subColor : textColor, fontFamily: 'Lexend_400Regular', textDecorationLine: item.isChecked ? 'line-through' : 'none' }} numberOfLines={1}>
                  {item.isChecked ? '☑ ' : '☐ '}{item.text}
                </Text>
              ))}
              {items.length > 5 && (
                <Text style={{ fontSize: typo.xs, color: subColor, fontFamily: 'Lexend_400Regular' }}>
                  +{items.length - 5} more
                </Text>
              )}
            </View>
          )
        } catch { return null }
      })()}
    </Pressable>
  )
}

export default function NotesScreen() {
  const { theme: t, typo } = useTheme()
  const insets = useSafeAreaInsets()
  const { notes, createNote, archiveNote, deleteNote, updateNote } = useNotes('active')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [fabOpen, setFabOpen] = useState(false)

  const filtered = useMemo(() => {
    if (!search.trim()) return notes as Note[]
    const q = search.toLowerCase()
    return (notes as Note[]).filter(n =>
      n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    )
  }, [notes, search])

  const pinned = filtered.filter(n => n.isPinned)
  const others = filtered.filter(n => !n.isPinned)

  const handleCreate = useCallback(async (type: NoteType) => {
    setFabOpen(false)
    const id = await createNote(type)
    router.push(`/notes/${id}` as never)
  }, [createNote])

  const handlePress = useCallback((note: Note) => {
    if (selected.size > 0) {
      setSelected(prev => {
        const next = new Set(prev)
        if (next.has(note.id)) next.delete(note.id)
        else next.add(note.id)
        return next
      })
    } else {
      router.push(`/notes/${note.id}` as never)
    }
  }, [selected])

  const handleLongPress = useCallback((note: Note) => {
    setSelected(prev => new Set(prev).add(note.id))
  }, [])

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  const bulkArchive = useCallback(async () => {
    for (const id of selected) await archiveNote(id)
    clearSelection()
  }, [selected, archiveNote, clearSelection])

  const bulkDelete = useCallback(async () => {
    Alert.alert('Move to Trash', `Move ${selected.size} note(s) to trash?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move', style: 'destructive',
        onPress: async () => {
          for (const id of selected) await deleteNote(id)
          clearSelection()
        },
      },
    ])
  }, [selected, deleteNote, clearSelection])

  const bulkPin = useCallback(async () => {
    for (const id of selected) await updateNote(id, { isPinned: true })
    clearSelection()
  }, [selected, updateNote, clearSelection])

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    header: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    title: { fontSize: typo.h3, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    overflowBtn: { flexDirection: 'row', gap: 8 },
    menuBtn: { width: 36, height: 36, backgroundColor: t.surface2, borderRadius: 12, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
    menuBtnTxt: { fontSize: 16 },
    searchBar: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 9, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular' },
    content: { paddingHorizontal: 12, paddingBottom: 100 },
    sectionHeader: { fontSize: typo.xs, fontWeight: '600', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Lexend_600SemiBold', paddingHorizontal: 4, paddingVertical: 8 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    cardWrap: { width: '48%' },
    empty: { paddingVertical: 48, alignItems: 'center' },
    emptyTxt: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center' },
    fab: { position: 'absolute', bottom: insets.bottom + 40, right: 24, width: 64, height: 64, borderRadius: 32, backgroundColor: '#800000', alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 8 },
    fabTxt: { color: '#fff', fontSize: 32, lineHeight: 36, marginTop: -2 },
    fabSub: { position: 'absolute', bottom: insets.bottom + 40 + 72, right: 24, gap: 10 },
    fabSubBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 28, paddingHorizontal: 20, paddingVertical: 14, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4, elevation: 4 },
    fabSubTxt: { fontSize: typo.md, color: t.textPrimary, fontFamily: 'Lexend_500Medium' },
    selBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: Math.max(16, insets.bottom + 10), gap: 16 },
    selCount: { flex: 1, fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    selAction: { fontSize: typo.sm, color: t.textSecondary, fontFamily: 'Lexend_400Regular', paddingVertical: 6, paddingHorizontal: 10 },
  }), [t, typo, insets])

  const renderGrid = (items: Note[]) => (
    <View style={s.grid}>
      {items.map(note => (
        <View key={note.id} style={s.cardWrap}>
          <NoteCard
            note={note}
            onPress={() => handlePress(note)}
            onLongPress={() => handleLongPress(note)}
            selected={selected.has(note.id)}
          />
        </View>
      ))}
    </View>
  )

  return (
    <EdgeSwipeNavigator>
      <SafeAreaView style={s.root}>
        <Stack.Screen options={{ animation: 'slide_from_left', headerShown: false }} />

        <View style={s.header}>
          <View style={s.titleRow}>
            <Text style={s.title}>Notes</Text>
            <View style={s.overflowBtn}>
              <TouchableOpacity style={s.menuBtn} onPress={() => router.push('/notes/archive' as never)}>
                <Text style={s.menuBtnTxt}>📦</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.menuBtn} onPress={() => router.push('/notes/trash' as never)}>
                <Text style={s.menuBtnTxt}>🗑</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.menuBtn} onPress={() => router.push('/notes/labels' as never)}>
                <Text style={s.menuBtnTxt}>🏷</Text>
              </TouchableOpacity>
            </View>
          </View>
          <TextInput
            style={s.searchBar}
            placeholder="Search notes…"
            placeholderTextColor={t.textTertiary}
            value={search}
            onChangeText={setSearch}
          />
        </View>

        <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
          {filtered.length === 0 && (
            <View style={s.empty}>
              <Text style={s.emptyTxt}>
                {search ? 'No notes match your search' : 'Tap + to create your first note'}
              </Text>
            </View>
          )}

          {pinned.length > 0 && (
            <>
              <Text style={s.sectionHeader}>Pinned</Text>
              {renderGrid(pinned)}
            </>
          )}

          {pinned.length > 0 && others.length > 0 && (
            <Text style={s.sectionHeader}>Other notes</Text>
          )}

          {others.length > 0 && renderGrid(others)}
        </ScrollView>

        {/* FAB */}
        {selected.size === 0 && (
          <>
            {fabOpen && (
              <View style={s.fabSub}>
                <TouchableOpacity style={s.fabSubBtn} onPress={() => handleCreate('text')}>
                  <Text style={s.fabSubTxt}>📝 Text note</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.fabSubBtn} onPress={() => handleCreate('checklist')}>
                  <Text style={s.fabSubTxt}>☑ Checklist</Text>
                </TouchableOpacity>
              </View>
            )}
            <TouchableOpacity
              style={s.fab}
              onPress={() => setFabOpen(o => !o)}
              onLongPress={() => handleCreate('text')}
            >
              <Text style={s.fabTxt}>{fabOpen ? '✕' : '+'}</Text>
            </TouchableOpacity>
          </>
        )}

        {/* Selection action bar */}
        {selected.size > 0 && (
          <View style={s.selBar}>
            <Text style={s.selCount}>{selected.size} selected</Text>
            <TouchableOpacity onPress={bulkPin}>
              <Text style={s.selAction}>📌 Pin</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={bulkArchive}>
              <Text style={s.selAction}>📦 Archive</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={bulkDelete}>
              <Text style={s.selAction}>🗑 Trash</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={clearSelection}>
              <Text style={s.selAction}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </SafeAreaView>
    </EdgeSwipeNavigator>
  )
}
