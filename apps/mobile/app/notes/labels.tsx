import { useState, useMemo } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { useNoteLabels } from '../../hooks/useNoteLabels'

export default function LabelsScreen() {
  const { theme: t, typo } = useTheme()
  const { labels, createLabel, renameLabel, deleteLabel } = useNoteLabels()
  const [newLabelName, setNewLabelName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const handleCreate = async () => {
    if (!newLabelName.trim()) return
    try {
      await createLabel(newLabelName)
      setNewLabelName('')
    } catch {
      Alert.alert('Label already exists', `"${newLabelName.trim()}" already exists.`)
    }
  }

  const handleRename = async (id: string) => {
    if (!editingName.trim()) { setEditingId(null); return }
    try {
      await renameLabel(id, editingName)
      setEditingId(null)
    } catch {
      Alert.alert('Label already exists', `"${editingName.trim()}" already exists.`)
    }
  }

  const handleDelete = (id: string, name: string) => {
    Alert.alert('Delete Label', `Delete "${name}"? This removes it from all notes.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void deleteLabel(id) },
    ])
  }

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: t.bg },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
    back: { padding: 8, marginRight: 8 },
    backTxt: { fontSize: typo.lg, color: t.textPrimary },
    screenTitle: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    createRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, gap: 10, borderBottomWidth: 1, borderBottomColor: t.border },
    createInput: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular', backgroundColor: t.surface, borderWidth: 1, borderColor: t.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 },
    createBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#800000' },
    createBtnTxt: { color: '#fff', fontFamily: 'Lexend_500Medium', fontSize: typo.sm },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.surfaceSubtle, gap: 12 },
    labelName: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular' },
    editInput: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular', borderBottomWidth: 1, borderBottomColor: t.accent, paddingVertical: 2 },
    rowBtn: { padding: 6 },
    rowBtnTxt: { fontSize: 16 },
    empty: { paddingVertical: 48, alignItems: 'center' },
    emptyTxt: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

  return (
    <SafeAreaView style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.topBar}>
        <TouchableOpacity style={s.back} onPress={() => router.back()}>
          <Text style={s.backTxt}>‹</Text>
        </TouchableOpacity>
        <Text style={s.screenTitle}>Labels</Text>
      </View>
      <View style={s.createRow}>
        <TextInput
          style={s.createInput}
          placeholder="New label name…"
          placeholderTextColor={t.textTertiary}
          value={newLabelName}
          onChangeText={setNewLabelName}
          onSubmitEditing={handleCreate}
          returnKeyType="done"
        />
        <TouchableOpacity style={s.createBtn} onPress={handleCreate}>
          <Text style={s.createBtnTxt}>Add</Text>
        </TouchableOpacity>
      </View>
      <ScrollView>
        {labels.length === 0 && (
          <View style={s.empty}>
            <Text style={s.emptyTxt}>No labels yet</Text>
          </View>
        )}
        {labels.map(label => (
          <View key={label.id} style={s.row}>
            {editingId === label.id ? (
              <>
                <TextInput
                  style={s.editInput}
                  value={editingName}
                  onChangeText={setEditingName}
                  onSubmitEditing={() => handleRename(label.id)}
                  autoFocus
                  returnKeyType="done"
                />
                <TouchableOpacity style={s.rowBtn} onPress={() => handleRename(label.id)}>
                  <Text style={s.rowBtnTxt}>✓</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.rowBtn} onPress={() => setEditingId(null)}>
                  <Text style={s.rowBtnTxt}>✕</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={s.labelName}>{label.name}</Text>
                <TouchableOpacity style={s.rowBtn} onPress={() => { setEditingId(label.id); setEditingName(label.name) }}>
                  <Text style={s.rowBtnTxt}>✏️</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.rowBtn} onPress={() => handleDelete(label.id, label.name)}>
                  <Text style={s.rowBtnTxt}>🗑</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  )
}
