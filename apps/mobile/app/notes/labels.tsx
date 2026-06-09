import { useState, useMemo } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router } from 'expo-router'
import { useTheme } from '../../theme/ThemeContext'
import { useNoteLabels } from '../../hooks/useNoteLabels'
import { ScreenScroll } from '../../components/ui/ScreenScroll'
import { Card } from '../../components/ui/Card'
import { SectionHeader } from '../../components/ui/SectionHeader'
import { spacing, radius } from '../../theme/tokens'

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
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, gap: spacing.xs },
    back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    backTxt: { fontSize: typo.h3, color: t.textPrimary, lineHeight: typo.h3 },
    title: { fontSize: typo.h2, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    subtitle: { fontSize: typo.sm, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: spacing.xs },
    createRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    createInput: { flex: 1, fontSize: typo.base, color: t.textPrimary, fontFamily: 'Lexend_400Regular', backgroundColor: t.surfaceSubtle, borderWidth: 1, borderColor: t.border, borderRadius: radius.md, borderCurve: 'continuous', paddingHorizontal: spacing.md, paddingVertical: spacing.sm, minHeight: 44 },
    createBtn: { minHeight: 44, paddingHorizontal: spacing.lg, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md, borderCurve: 'continuous', backgroundColor: t.accent },
    createBtnTxt: { color: '#fff', fontFamily: 'Outfit_700Bold', fontSize: typo.base },
    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: spacing.md, gap: spacing.md },
    rowDivider: { borderTopWidth: 1, borderTopColor: t.divider },
    labelName: { flex: 1, fontSize: typo.base, color: t.textPrimary, fontFamily: 'Lexend_400Regular' },
    editInput: { flex: 1, fontSize: typo.base, color: t.textPrimary, fontFamily: 'Lexend_400Regular', borderBottomWidth: 1, borderBottomColor: t.accent, paddingVertical: spacing.xs },
    rowBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
    rowBtnTxt: { fontSize: typo.md },
    empty: { paddingVertical: spacing.xxl, alignItems: 'center' },
    emptyTxt: { fontSize: typo.base, color: t.textTertiary, fontFamily: 'Lexend_400Regular' },
  }), [t, typo])

  return (
    <SafeAreaView style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={s.topBar}>
        <Pressable
          style={({ pressed }) => [s.back, pressed ? { opacity: 0.6 } : null]}
          onPress={() => router.back()}
          accessibilityRole="button"
          hitSlop={8}
        >
          <Text style={s.backTxt}>‹</Text>
        </Pressable>
        <View>
          <Text style={s.title}>Labels</Text>
        </View>
      </View>
      <ScreenScroll tabBarInset={false} padded keyboardShouldPersistTaps="handled">
        <Card elevated style={{ gap: spacing.md, marginTop: spacing.sm }}>
          <SectionHeader title="New label" />
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
            <Pressable
              style={({ pressed }) => [s.createBtn, pressed ? { opacity: 0.85 } : null]}
              onPress={handleCreate}
              accessibilityRole="button"
            >
              <Text style={s.createBtnTxt}>Add</Text>
            </Pressable>
          </View>
        </Card>

        <View style={{ marginTop: spacing.xl }}>
          <SectionHeader title="Your labels" />
          <Card elevated padded={false} style={{ paddingHorizontal: spacing.lg }}>
            {labels.length === 0 ? (
              <View style={s.empty}>
                <Text style={s.emptyTxt}>No labels yet</Text>
              </View>
            ) : (
              labels.map((label, index) => (
                <View key={label.id} style={[s.row, index > 0 ? s.rowDivider : null]}>
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
                      <Pressable
                        style={({ pressed }) => [s.rowBtn, pressed ? { opacity: 0.6 } : null]}
                        onPress={() => handleRename(label.id)}
                        accessibilityRole="button"
                      >
                        <Text style={s.rowBtnTxt}>✓</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [s.rowBtn, pressed ? { opacity: 0.6 } : null]}
                        onPress={() => setEditingId(null)}
                        accessibilityRole="button"
                      >
                        <Text style={s.rowBtnTxt}>✕</Text>
                      </Pressable>
                    </>
                  ) : (
                    <>
                      <Text style={s.labelName}>{label.name}</Text>
                      <Pressable
                        style={({ pressed }) => [s.rowBtn, pressed ? { opacity: 0.6 } : null]}
                        onPress={() => { setEditingId(label.id); setEditingName(label.name) }}
                        accessibilityRole="button"
                      >
                        <Text style={s.rowBtnTxt}>✏️</Text>
                      </Pressable>
                      <Pressable
                        style={({ pressed }) => [s.rowBtn, pressed ? { opacity: 0.6 } : null]}
                        onPress={() => handleDelete(label.id, label.name)}
                        accessibilityRole="button"
                      >
                        <Text style={s.rowBtnTxt}>🗑</Text>
                      </Pressable>
                    </>
                  )}
                </View>
              ))
            )}
          </Card>
        </View>
      </ScreenScroll>
    </SafeAreaView>
  )
}
