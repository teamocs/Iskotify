import { useState } from 'react'
import { View, Text } from 'react-native'
import { Stack } from 'expo-router'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Bookmark1Outlined, PlusOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { spacing, textStyle } from '../../theme/tokens'
import { useNoteLabels } from '../../hooks/useNoteLabels'
import { confirmAction } from '../../utils/confirmAction'
import { Screen } from '../../components/ui/Screen'
import { PageTitle } from '../../components/ui/PageTitle'
import { Card } from '../../components/ui/Card'
import { Button } from '../../components/ui/Button'
import { TextField } from '../../components/ui/TextField'
import { EmptyState } from '../../components/ui/EmptyState'
import { heading } from '../../components/ui/a11y'
import { DetailTopBar } from '../../components/explore/DetailTopBar'

export default function LabelsScreen() {
  const { theme: t } = useTheme()
  const { labels, createLabel, renameLabel, deleteLabel } = useNoteLabels()
  const [newLabelName, setNewLabelName] = useState('')
  const [createError, setCreateError] = useState<string | undefined>()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [renameError, setRenameError] = useState<string | undefined>()

  const handleCreate = async () => {
    const name = newLabelName.trim()
    if (!name) return
    try {
      await createLabel(name)
      setNewLabelName('')
      setCreateError(undefined)
    } catch {
      setCreateError(`"${name}" already exists.`)
    }
  }

  const startRename = (id: string, name: string) => {
    setEditingId(id)
    setEditingName(name)
    setRenameError(undefined)
  }

  const handleRename = async (id: string) => {
    const name = editingName.trim()
    if (!name) { setEditingId(null); return }
    try {
      await renameLabel(id, name)
      setEditingId(null)
      setRenameError(undefined)
    } catch {
      setRenameError(`"${name}" already exists.`)
    }
  }

  const handleDelete = (id: string, name: string) => {
    confirmAction(
      'Delete label',
      `Delete "${name}"? It is removed from every note. The notes themselves stay.`,
      'Delete',
      () => void deleteLabel(id),
      { destructive: true },
    )
  }

  return (
    <Screen header={<DetailTopBar bare fallbackHref="/notes" />}>
      <Stack.Screen options={{ headerShown: false }} />
      <PageTitle title="Labels" lead="Group notes by subject or exam. Add labels to a note from its toolbar." />

      <Card style={{ gap: spacing.md }}>
        <TextField
          label="New label"
          placeholder="For example, UPCAT math"
          value={newLabelName}
          onChangeText={(v) => { setNewLabelName(v); if (createError) setCreateError(undefined) }}
          onSubmitEditing={() => void handleCreate()}
          returnKeyType="done"
          error={createError}
          maxLength={40}
        />
        <Button
          label="Add label"
          onPress={() => void handleCreate()}
          disabled={!newLabelName.trim()}
          icon={<Lineicons icon={PlusOutlined} size={18} color={t.textInverse} />}
        />
      </Card>

      <View style={{ marginTop: spacing.xxl }}>
        <Text {...heading(2)} style={[textStyle('titleSm', t.textPrimary), { marginBottom: spacing.sm }]} maxFontSizeMultiplier={2}>
          Your labels
        </Text>
        {labels.length === 0 ? (
          <EmptyState
            icon={<Lineicons icon={Bookmark1Outlined} size={26} color={t.textSecondary} />}
            title="No labels yet"
            body="Add one above, then tag notes with it from the note toolbar."
          />
        ) : (
          <Card padded={false}>
            {labels.map((label, index) => (
              <View
                key={label.id}
                style={{
                  paddingHorizontal: spacing.lg,
                  paddingVertical: spacing.sm,
                  borderTopWidth: index > 0 ? 1 : 0,
                  borderTopColor: t.divider,
                }}
              >
                {editingId === label.id ? (
                  <View style={{ gap: spacing.sm, paddingVertical: spacing.sm }}>
                    <TextField
                      label="Label name"
                      value={editingName}
                      onChangeText={(v) => { setEditingName(v); if (renameError) setRenameError(undefined) }}
                      onSubmitEditing={() => void handleRename(label.id)}
                      autoFocus
                      returnKeyType="done"
                      error={renameError}
                      maxLength={40}
                    />
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
                      <Button size="sm" variant="secondary" label="Save" accessibilityLabel="Save label name" onPress={() => void handleRename(label.id)} />
                      <Button size="sm" variant="ghost" label="Cancel" accessibilityLabel="Cancel renaming" onPress={() => setEditingId(null)} />
                    </View>
                  </View>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.xs, minHeight: 44 }}>
                    <Text style={[textStyle('body', t.textPrimary), { flex: 1, minWidth: 120 }]} maxFontSizeMultiplier={2}>
                      {label.name}
                    </Text>
                    <Button size="sm" variant="ghost" label="Rename" accessibilityLabel={`Rename ${label.name}`} onPress={() => startRename(label.id, label.name)} />
                    <Button size="sm" variant="ghost" label="Delete" accessibilityLabel={`Delete ${label.name}`} onPress={() => handleDelete(label.id, label.name)} />
                  </View>
                )}
              </View>
            ))}
          </Card>
        )}
      </View>
    </Screen>
  )
}
