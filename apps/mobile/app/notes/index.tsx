import { useState, useMemo, useCallback } from 'react'
import {
  View, Text, TextInput, ScrollView,
  StyleSheet, Pressable, Alert, Modal,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  BoxArchive1Outlined,
  Trash3Outlined,
  Bookmark1Outlined,
  MapPin5Outlined,
  Pencil1Outlined,
  CheckSquare2Outlined,
  XmarkOutlined,
  Bell1Outlined,
} from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, radius } from '../../theme/tokens'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { useNotes, NOTE_COLORS, type Note, type NoteType } from '../../hooks/useNotes'
import { EdgeSwipeNavigator } from '../../components/EdgeSwipeNavigator'

function formatReminderShort(ms: number): string {
  const d = new Date(ms)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const isTomorrow = d.toDateString() === tomorrow.toDateString()
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (isToday) return `Today ${time}`
  if (isTomorrow) return `Tomorrow ${time}`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` ${time}`
}

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
  const now = Date.now()
  const hasReminder = note.reminderAt != null && note.reminderAt > now

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: radius.lg,
          borderCurve: 'continuous',
          padding: spacing.md,
          borderWidth: selected ? 2 : 1,
          borderColor: selected ? '#800000' : (note.color ? 'rgba(0,0,0,0.1)' : t.border),
          flex: 1,
          boxShadow: t.shadowSm,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {note.isPinned ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginBottom: spacing.xs }}>
          <Lineicons icon={MapPin5Outlined} size={12} color={subColor} />
          <Text style={{ fontSize: typo.xs, color: subColor }}>Pinned</Text>
        </View>
      ) : null}
      {note.title.length > 0 ? (
        <Text
          style={{ fontSize: typo.sm, fontWeight: '700', color: textColor, fontFamily: 'Outfit_700Bold', marginBottom: spacing.xs }}
          numberOfLines={2}
        >
          {note.title}
        </Text>
      ) : null}
      {note.type === 'text' && note.content.length > 0 ? (
        <Text
          style={{ fontSize: typo.xs, color: subColor, fontFamily: 'Lexend_400Regular', lineHeight: 16 }}
          numberOfLines={4}
        >
          {note.content}
        </Text>
      ) : null}
      {note.type === 'checklist' ? (() => {
        try {
          const items = JSON.parse(note.content) as Array<{ text: string; isChecked: boolean }>
          return (
            <View style={{ gap: 3 }}>
              {items.slice(0, 5).map((item, i) => (
                <Text key={i} style={{ fontSize: typo.xs, color: item.isChecked ? subColor : textColor, fontFamily: 'Lexend_400Regular', textDecorationLine: item.isChecked ? 'line-through' : 'none' }} numberOfLines={1}>
                  {item.isChecked ? '☑ ' : '☐ '}{item.text}
                </Text>
              ))}
              {items.length > 5 ? (
                <Text style={{ fontSize: typo.xs, color: subColor, fontFamily: 'Lexend_400Regular' }}>
                  +{items.length - 5} more
                </Text>
              ) : null}
            </View>
          )
        } catch { return null }
      })() : null}
      {hasReminder ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.sm, paddingTop: 6, borderTopWidth: 1, borderTopColor: note.color ? 'rgba(0,0,0,0.08)' : t.surfaceSubtle }}>
          <Lineicons icon={Bell1Outlined} size={12} color={subColor} />
          <Text style={{ fontSize: typo.xs, color: subColor, fontFamily: 'Lexend_400Regular' }}>
            {formatReminderShort(note.reminderAt!)}
          </Text>
        </View>
      ) : null}
    </Pressable>
  )
}

export default function NotesScreen() {
  const { theme: t, typo } = useTheme()
  const insets = useSafeAreaInsets()
  const { notes, createNote, archiveNote, deleteNote, updateNote } = useNotes('active')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [fabSheetOpen, setFabSheetOpen] = useState(false)

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
    setFabSheetOpen(false)
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
    header: { paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.sm },
    titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
    title: { fontSize: typo.h2, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    headerBtns: { flexDirection: 'row', gap: spacing.sm },
    iconBtn: { width: 40, height: 40, backgroundColor: t.surface2, borderRadius: radius.sm, borderCurve: 'continuous', borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
    searchBar: { backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, borderCurve: 'continuous', paddingHorizontal: spacing.lg, paddingVertical: 11, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular' },
    content: { paddingHorizontal: spacing.md, paddingBottom: 100 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    cardWrap: { width: '48%' },
    empty: { paddingVertical: 48, alignItems: 'center' },
    emptyTxt: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', textAlign: 'center' },
    fab: { position: 'absolute', bottom: insets.bottom + 40, right: spacing.xxl, width: 64, height: 64, borderRadius: radius.pill, backgroundColor: '#800000', alignItems: 'center', justifyContent: 'center', boxShadow: t.shadowMd },
    fabTxt: { color: '#fff', fontSize: 32, lineHeight: 36, marginTop: -2 },
    // Selection bar
    selBar: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: t.surface, borderTopWidth: 1, borderTopColor: t.border, flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: Math.max(spacing.lg, insets.bottom + spacing.md), gap: spacing.sm },
    selCount: { flex: 1, fontSize: typo.sm, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    selBtn: { width: 44, height: 44, borderRadius: radius.sm, borderCurve: 'continuous', backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
    selBtnDanger: { borderColor: 'rgba(248,113,113,0.4)', backgroundColor: 'rgba(248,113,113,0.08)' },
    pressed: { opacity: 0.7 },
    // Bottom sheet
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: { backgroundColor: t.bg, borderTopLeftRadius: radius.xxl, borderTopRightRadius: radius.xxl, paddingBottom: Math.max(spacing.xxxl, insets.bottom + spacing.lg), paddingTop: spacing.md },
    sheetHandle: { width: 36, height: 4, backgroundColor: t.divider, borderRadius: 2, alignSelf: 'center', marginBottom: spacing.xl },
    sheetTitle: { fontSize: typo.xs, fontWeight: '600', color: t.textTertiary, textTransform: 'uppercase', letterSpacing: 0.8, fontFamily: 'Lexend_600SemiBold', paddingHorizontal: spacing.xl, marginBottom: spacing.sm },
    sheetOption: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg, paddingHorizontal: spacing.xl, paddingVertical: spacing.lg, borderBottomWidth: 1, borderBottomColor: t.surfaceSubtle },
    sheetOptionLabel: { fontSize: typo.md, color: t.textPrimary, fontFamily: 'Lexend_500Medium' },
    sheetOptionSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 1 },
    sheetIconWrap: { width: 44, height: 44, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
    cancelBtn: { marginHorizontal: spacing.lg, marginTop: spacing.md, paddingVertical: spacing.md, borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: t.surface2, alignItems: 'center', borderWidth: 1, borderColor: t.border },
    cancelTxt: { fontSize: typo.md, color: t.textPrimary, fontFamily: 'Lexend_500Medium' },
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
            <View style={s.headerBtns}>
              <Pressable
                style={({ pressed }) => [s.iconBtn, pressed ? s.pressed : null]}
                onPress={() => router.push('/notes/archive' as never)}
              >
                <Lineicons icon={BoxArchive1Outlined} size={18} color={t.textSecondary} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.iconBtn, pressed ? s.pressed : null]}
                onPress={() => router.push('/notes/trash' as never)}
              >
                <Lineicons icon={Trash3Outlined} size={18} color={t.textSecondary} />
              </Pressable>
              <Pressable
                style={({ pressed }) => [s.iconBtn, pressed ? s.pressed : null]}
                onPress={() => router.push('/notes/labels' as never)}
              >
                <Lineicons icon={Bookmark1Outlined} size={18} color={t.textSecondary} />
              </Pressable>
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
          {filtered.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyTxt}>
                {search ? 'No notes match your search' : 'Tap + to create your first note'}
              </Text>
            </View>
          ) : null}

          {pinned.length > 0 ? (
            <>
              <SectionHeader title="Pinned" />
              {renderGrid(pinned)}
            </>
          ) : null}

          {pinned.length > 0 && others.length > 0 ? (
            <View style={{ marginTop: spacing.lg }}>
              <SectionHeader title="Other notes" />
            </View>
          ) : null}

          {others.length > 0 ? renderGrid(others) : null}
        </ScrollView>

        {/* FAB */}
        {selected.size === 0 ? (
          <Pressable
            style={({ pressed }) => [s.fab, pressed ? s.pressed : null]}
            onPress={() => setFabSheetOpen(true)}
            onLongPress={() => void handleCreate('text')}
          >
            <Text style={s.fabTxt}>+</Text>
          </Pressable>
        ) : null}

        {/* Selection action bar */}
        {selected.size > 0 ? (
          <View style={s.selBar}>
            <Text style={s.selCount}>{selected.size} selected</Text>
            <Pressable style={({ pressed }) => [s.selBtn, pressed ? s.pressed : null]} onPress={bulkPin}>
              <Lineicons icon={MapPin5Outlined} size={18} color={t.textSecondary} />
            </Pressable>
            <Pressable style={({ pressed }) => [s.selBtn, pressed ? s.pressed : null]} onPress={bulkArchive}>
              <Lineicons icon={BoxArchive1Outlined} size={18} color={t.textSecondary} />
            </Pressable>
            <Pressable style={({ pressed }) => [s.selBtn, s.selBtnDanger, pressed ? s.pressed : null]} onPress={bulkDelete}>
              <Lineicons icon={Trash3Outlined} size={18} color="#f87171" />
            </Pressable>
            <Pressable style={({ pressed }) => [s.selBtn, pressed ? s.pressed : null]} onPress={clearSelection}>
              <Lineicons icon={XmarkOutlined} size={18} color={t.textSecondary} />
            </Pressable>
          </View>
        ) : null}

        {/* iOS-style FAB bottom sheet */}
        <Modal
          visible={fabSheetOpen}
          transparent
          animationType="slide"
          onRequestClose={() => setFabSheetOpen(false)}
          statusBarTranslucent
        >
          <Pressable style={s.backdrop} onPress={() => setFabSheetOpen(false)} />
          <View style={s.sheet}>
            <View style={s.sheetHandle} />
            <Text style={s.sheetTitle}>New Note</Text>

            <Pressable style={({ pressed }) => [s.sheetOption, pressed ? s.pressed : null]} onPress={() => void handleCreate('text')}>
              <View style={s.sheetIconWrap}>
                <Lineicons icon={Pencil1Outlined} size={20} color="#800000" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetOptionLabel}>Text Note</Text>
                <Text style={s.sheetOptionSub}>Write freely in a rich text note</Text>
              </View>
            </Pressable>

            <Pressable style={({ pressed }) => [s.sheetOption, { borderBottomWidth: 0 }, pressed ? s.pressed : null]} onPress={() => void handleCreate('checklist')}>
              <View style={s.sheetIconWrap}>
                <Lineicons icon={CheckSquare2Outlined} size={20} color="#800000" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.sheetOptionLabel}>Checklist</Text>
                <Text style={s.sheetOptionSub}>Create a to-do or checklist note</Text>
              </View>
            </Pressable>

            <Pressable style={({ pressed }) => [s.cancelBtn, pressed ? s.pressed : null]} onPress={() => setFabSheetOpen(false)}>
              <Text style={s.cancelTxt}>Cancel</Text>
            </Pressable>
          </View>
        </Modal>
      </SafeAreaView>
    </EdgeSwipeNavigator>
  )
}
