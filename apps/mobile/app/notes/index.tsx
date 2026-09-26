import { useState, useMemo, useCallback } from 'react'
import { View, Text, Pressable } from 'react-native'
import { Stack, router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  BoxArchive1Outlined,
  Trash3Outlined,
  Bookmark1Outlined,
  MapPin5Outlined,
  Pencil1Outlined,
  CheckSquare2Outlined,
  PlusOutlined,
  Search1Outlined,
  Notebook1Outlined,
} from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { useBreakpoint } from '../../hooks/useBreakpoint'
import { useSafeInsets } from '../../hooks/useSafeInsets'
import { useNotes, type Note, type NoteType } from '../../hooks/useNotes'
import { confirmAction } from '../../utils/confirmAction'
import { Screen } from '../../components/ui/Screen'
import { PageTitle } from '../../components/ui/PageTitle'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { ListRow } from '../../components/ui/ListRow'
import { Sheet } from '../../components/ui/Sheet'
import { decorative, focusRing, type WebPressableState } from '../../components/ui/a11y'
import { DetailTopBar } from '../../components/explore/DetailTopBar'
import { EdgeSwipeNavigator } from '../../components/EdgeSwipeNavigator'
import { NoteCard } from '../../components/notes/NoteCard'
import { NotesGrid, NotesSectionHeading, NotesSkeleton } from '../../components/notes/NotesGrid'

const NAV = [
  { label: 'Archive', href: '/notes/archive', icon: BoxArchive1Outlined },
  { label: 'Trash', href: '/notes/trash', icon: Trash3Outlined },
  { label: 'Labels', href: '/notes/labels', icon: Bookmark1Outlined },
] as const

export default function NotesScreen() {
  const { theme: t } = useTheme()
  const bp = useBreakpoint()
  const insets = useSafeInsets()
  const phone = bp === 'compact'
  const { notes, loading, error, reload, createNote, archiveNote, deleteNote, updateNote } = useNotes('active')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [chooserOpen, setChooserOpen] = useState(false)
  const selecting = selected.size > 0

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return notes
    return notes.filter(n => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q))
  }, [notes, search])

  const pinned = filtered.filter(n => n.isPinned)
  const others = filtered.filter(n => !n.isPinned)

  const handleCreate = useCallback(async (type: NoteType) => {
    setChooserOpen(false)
    const id = await createNote(type)
    router.push(`/notes/${id}` as never)
  }, [createNote])

  const handlePress = useCallback((note: Note) => {
    if (selecting) {
      setSelected(prev => {
        const next = new Set(prev)
        if (next.has(note.id)) next.delete(note.id)
        else next.add(note.id)
        return next
      })
    } else {
      router.push(`/notes/${note.id}` as never)
    }
  }, [selecting])

  const handleLongPress = useCallback((note: Note) => {
    setSelected(prev => new Set(prev).add(note.id))
  }, [])

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  const bulkPin = useCallback(async () => {
    for (const id of selected) await updateNote(id, { isPinned: true })
    clearSelection()
  }, [selected, updateNote, clearSelection])

  const bulkArchive = useCallback(async () => {
    for (const id of selected) await archiveNote(id)
    clearSelection()
  }, [selected, archiveNote, clearSelection])

  const bulkDelete = useCallback(() => {
    const ids = [...selected]
    confirmAction(
      'Move to trash',
      `Move ${ids.length} ${ids.length === 1 ? 'note' : 'notes'} to trash? Trash is emptied after 7 days.`,
      'Move to trash',
      async () => {
        for (const id of ids) await deleteNote(id)
        clearSelection()
      },
      { destructive: true },
    )
  }, [selected, deleteNote, clearSelection])

  const renderGrid = (items: Note[]) => (
    <NotesGrid
      items={items}
      keyOf={n => n.id}
      renderItem={note => (
        <NoteCard
          note={note}
          onPress={() => handlePress(note)}
          onLongPress={() => handleLongPress(note)}
          selected={selecting ? selected.has(note.id) : undefined}
        />
      )}
    />
  )

  const selectionBar = (
    <View
      style={{
        flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm,
        minHeight: 56, paddingVertical: spacing.sm,
      }}
    >
      <Text
        accessibilityLiveRegion="polite"
        style={[textStyle('titleSm', t.textPrimary), { flexGrow: 1 }]}
        maxFontSizeMultiplier={2}
      >
        {`${selected.size} selected`}
      </Text>
      <Button size="sm" variant="secondary" label="Pin" onPress={() => void bulkPin()}
        icon={<Lineicons icon={MapPin5Outlined} size={16} color={t.accentText} />} />
      <Button size="sm" variant="secondary" label="Archive" onPress={() => void bulkArchive()}
        icon={<Lineicons icon={BoxArchive1Outlined} size={16} color={t.accentText} />} />
      <Button size="sm" variant="danger" label="Move to trash" onPress={bulkDelete}
        icon={<Lineicons icon={Trash3Outlined} size={16} color={t.dangerStrong} />} />
      <Button size="sm" variant="ghost" label="Cancel" onPress={clearSelection} accessibilityLabel="Clear selection" />
    </View>
  )

  const newNoteIcon = <Lineicons icon={PlusOutlined} size={18} color={t.textInverse} />

  let body: React.ReactNode
  if (loading && notes.length === 0) {
    body = <NotesSkeleton />
  } else if (error && notes.length === 0) {
    body = <ErrorState title="Couldn't load your notes" body="Your notes are saved on this device. Try again." onRetry={reload} />
  } else if (notes.length === 0) {
    body = (
      <EmptyState
        icon={<Lineicons icon={Notebook1Outlined} size={26} color={t.textSecondary} />}
        title="No notes yet"
        body="Keep formulas, reminders and checklists for your review here. Use New note to write your first one."
      />
    )
  } else if (filtered.length === 0) {
    body = (
      <EmptyState
        icon={<Lineicons icon={Search1Outlined} size={26} color={t.textSecondary} />}
        title="No matching notes"
        body={`Nothing in your notes matches "${search.trim()}".`}
      />
    )
  } else {
    body = (
      <View style={{ gap: spacing.xl }}>
        {pinned.length > 0 ? (
          <View>
            <NotesSectionHeading title="Pinned" />
            {renderGrid(pinned)}
          </View>
        ) : null}
        {others.length > 0 ? (
          <View>
            {pinned.length > 0 ? <NotesSectionHeading title="Other notes" /> : null}
            {renderGrid(others)}
          </View>
        ) : null}
      </View>
    )
  }

  return (
    <EdgeSwipeNavigator>
      <Stack.Screen options={{ animation: 'slide_from_left', headerShown: false }} />
      <View style={{ flex: 1, backgroundColor: t.bg }}>
        <Screen
          width="wide"
          header={selecting ? selectionBar : <DetailTopBar bare fallbackHref="/practice" />}
          contentContainerStyle={phone ? { paddingBottom: 56 + spacing.xxl } : undefined}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', columnGap: spacing.lg }}>
            <View style={{ flexShrink: 1, flexGrow: 1 }}>
              <PageTitle title="Notes" lead="Formulas, reminders and checklists for your review." />
            </View>
            {!phone ? (
              <Button label="New note" onPress={() => setChooserOpen(true)} icon={newNoteIcon} style={{ marginTop: spacing.xs }} />
            ) : null}
          </View>

          <View
            style={{
              flexDirection: phone ? 'column' : 'row',
              alignItems: phone ? 'stretch' : 'flex-end',
              gap: spacing.md,
              marginBottom: spacing.xl,
            }}
          >
            <View style={{ flex: phone ? undefined : 1 }}>
              <TextField
                label="Search notes"
                placeholder="Title or text"
                value={search}
                onChangeText={setSearch}
                returnKeyType="search"
                autoCorrect={false}
              />
            </View>
            <View
              accessibilityRole="toolbar"
              accessibilityLabel="Other note lists"
              style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginLeft: phone ? -spacing.md : 0 }}
            >
              {NAV.map(item => (
                <Button
                  key={item.href}
                  size="sm"
                  variant="ghost"
                  label={item.label}
                  onPress={() => router.push(item.href as never)}
                  icon={<Lineicons icon={item.icon} size={16} color={t.accentText} />}
                />
              ))}
            </View>
          </View>

          {body}
        </Screen>

        {phone && !selecting ? (
          <Pressable
            testID="notes-fab"
            onPress={() => setChooserOpen(true)}
            onLongPress={() => void handleCreate('text')}
            accessibilityRole="button"
            accessibilityLabel="New note"
            accessibilityHint="Long press to start a text note straight away."
            style={(state) => {
              const { pressed, focused } = state as WebPressableState
              return [
                {
                  position: 'absolute', right: spacing.xl, bottom: insets.bottom + spacing.xl,
                  width: 56, height: 56, borderRadius: radius.pill,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: pressed ? t.accentPressed : t.accent,
                  boxShadow: t.shadowMd,
                },
                focusRing(t.focusRing, focused),
              ]
            }}
          >
            <View {...decorative}><Lineicons icon={PlusOutlined} size={24} color={t.textInverse} /></View>
          </Pressable>
        ) : null}

        <Sheet visible={chooserOpen} title="New note" onClose={() => setChooserOpen(false)}>
          <ListRow
            leading={<Lineicons icon={Pencil1Outlined} size={20} color={t.accentText} />}
            title="Text note"
            subtitle="Write freely"
            onPress={() => void handleCreate('text')}
            showChevron={false}
          />
          <ListRow
            leading={<Lineicons icon={CheckSquare2Outlined} size={20} color={t.accentText} />}
            title="Checklist"
            subtitle="A to-do list you can tick off"
            onPress={() => void handleCreate('checklist')}
            showChevron={false}
          />
        </Sheet>
      </View>
    </EdgeSwipeNavigator>
  )
}
