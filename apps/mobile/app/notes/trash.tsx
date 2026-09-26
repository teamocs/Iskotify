import { useEffect } from 'react'
import { View } from 'react-native'
import { Stack } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Trash3Outlined, RefreshCircle1ClockwiseOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'
import { useNotes, type Note } from '../../hooks/useNotes'
import { confirmAction } from '../../utils/confirmAction'
import { Screen } from '../../components/ui/Screen'
import { PageTitle } from '../../components/ui/PageTitle'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { DetailTopBar } from '../../components/explore/DetailTopBar'
import { NoteCard } from '../../components/notes/NoteCard'
import { NotesGrid, NotesSkeleton } from '../../components/notes/NotesGrid'

export default function TrashScreen() {
  const { theme: t } = useTheme()
  const { notes, loading, error, reload, restoreNote, permanentlyDeleteNote, emptyTrash, pruneOldTrashedNotes } = useNotes('trashed')

  // Prune on mount
  useEffect(() => {
    void pruneOldTrashedNotes()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleEmptyTrash = () => {
    confirmAction(
      'Empty trash',
      'Delete every note in the trash forever? This cannot be undone.',
      'Delete all',
      () => void emptyTrash(),
      { destructive: true },
    )
  }

  const handleDeleteForever = (note: Note) => {
    confirmAction(
      'Delete forever',
      `Delete "${note.title || 'Untitled note'}" forever? This cannot be undone.`,
      'Delete forever',
      () => void permanentlyDeleteNote(note.id),
      { destructive: true },
    )
  }

  const renderNote = (note: Note) => {
    const name = note.title || 'Untitled note'
    return (
      <NoteCard
        note={note}
        footer={
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Button
              size="sm"
              variant="secondary"
              label="Restore"
              accessibilityLabel={`Restore ${name}`}
              onPress={() => void restoreNote(note.id)}
              icon={<Lineicons icon={RefreshCircle1ClockwiseOutlined} size={16} color={t.accentText} />}
            />
            <Button
              size="sm"
              variant="danger"
              label="Delete forever"
              accessibilityLabel={`Delete ${name} forever`}
              onPress={() => handleDeleteForever(note)}
              icon={<Lineicons icon={Trash3Outlined} size={16} color={t.dangerStrong} />}
            />
          </View>
        }
      />
    )
  }

  let body: React.ReactNode
  if (loading && notes.length === 0) body = <NotesSkeleton />
  else if (error && notes.length === 0) body = <ErrorState title="Couldn't load the trash" onRetry={reload} />
  else if (notes.length === 0) {
    body = (
      <EmptyState
        icon={<Lineicons icon={Trash3Outlined} size={26} color={t.textSecondary} />}
        title="Trash is empty"
        body="Notes you move to trash stay here for 7 days."
      />
    )
  } else body = <NotesGrid items={notes} keyOf={n => n.id} renderItem={renderNote} />

  return (
    <Screen width="wide" header={<DetailTopBar bare fallbackHref="/notes" />}>
      <Stack.Screen options={{ headerShown: false }} />
      <PageTitle
        title="Trash"
        lead="Notes here are deleted forever after 7 days."
        trailing={notes.length > 0 ? (
          <Button size="sm" variant="danger" label="Empty trash" onPress={handleEmptyTrash} />
        ) : undefined}
      />
      {body}
    </Screen>
  )
}
