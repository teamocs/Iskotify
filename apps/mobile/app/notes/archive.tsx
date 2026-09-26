import { View } from 'react-native'
import { Stack, router } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { BoxArchive1Outlined, Trash3Outlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing } from '../../theme/tokens'
import { useNotes, type Note } from '../../hooks/useNotes'
import { Screen } from '../../components/ui/Screen'
import { PageTitle } from '../../components/ui/PageTitle'
import { Button } from '../../components/ui/Button'
import { EmptyState } from '../../components/ui/EmptyState'
import { ErrorState } from '../../components/ui/ErrorState'
import { DetailTopBar } from '../../components/explore/DetailTopBar'
import { NoteCard } from '../../components/notes/NoteCard'
import { NotesGrid, NotesSkeleton } from '../../components/notes/NotesGrid'

export default function ArchiveScreen() {
  const { theme: t } = useTheme()
  const { notes, loading, error, reload, unarchiveNote, deleteNote } = useNotes('archived')

  const renderNote = (note: Note) => {
    const name = note.title || 'Untitled note'
    return (
      <NoteCard
        note={note}
        onPress={() => router.push(`/notes/${note.id}` as never)}
        footer={
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
            <Button
              size="sm"
              variant="secondary"
              label="Unarchive"
              accessibilityLabel={`Unarchive ${name}`}
              onPress={() => void unarchiveNote(note.id)}
              icon={<Lineicons icon={BoxArchive1Outlined} size={16} color={t.accentText} />}
            />
            <Button
              size="sm"
              variant="danger"
              label="Trash"
              accessibilityLabel={`Move ${name} to trash`}
              onPress={() => void deleteNote(note.id)}
              icon={<Lineicons icon={Trash3Outlined} size={16} color={t.dangerStrong} />}
            />
          </View>
        }
      />
    )
  }

  let body: React.ReactNode
  if (loading && notes.length === 0) body = <NotesSkeleton />
  else if (error && notes.length === 0) body = <ErrorState title="Couldn't load your archive" onRetry={reload} />
  else if (notes.length === 0) {
    body = (
      <EmptyState
        icon={<Lineicons icon={BoxArchive1Outlined} size={26} color={t.textSecondary} />}
        title="No archived notes"
        body="Archive a note to set it aside without deleting it."
      />
    )
  } else body = <NotesGrid items={notes} keyOf={n => n.id} renderItem={renderNote} />

  return (
    <Screen width="wide" header={<DetailTopBar bare fallbackHref="/notes" />}>
      <Stack.Screen options={{ headerShown: false }} />
      <PageTitle title="Archive" lead="Notes you have set aside. Unarchive one to bring it back to your notes." />
      {body}
    </Screen>
  )
}
