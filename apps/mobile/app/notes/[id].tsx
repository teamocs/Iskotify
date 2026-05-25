import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Modal, KeyboardAvoidingView, Platform,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { eq } from 'drizzle-orm'
import { useTheme } from '../../theme/ThemeContext'
import { useDb } from '../../hooks/useDb'
import { useNoteLabels } from '../../hooks/useNoteLabels'
import { NOTE_COLORS, parseChecklistItems, type NoteColor, type NoteType, type ChecklistItem } from '../../hooks/useNotes'
import { notes as notesTable } from '../../db/schema'

const COLOR_KEYS = [null, 'red', 'pink', 'orange', 'yellow', 'teal', 'green', 'cyan', 'blue', 'cerulean', 'purple', 'gray'] as const

export default function NoteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { theme: t, typo } = useTheme()
  const db = useDb()
  const { labels, assignedLabelIds, assignLabel, unassignLabel } = useNoteLabels()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [type, setType] = useState<NoteType>('text')
  const [color, setColor] = useState<NoteColor>(null)
  const [checkItems, setCheckItems] = useState<ChecklistItem[]>([])
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [assignedIds, setAssignedIds] = useState<string[]>([])
  const [loaded, setLoaded] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load note on mount
  useEffect(() => {
    if (!id) return
    void db.select().from(notesTable).where(eq(notesTable.id, id)).limit(1).then(rows => {
      const row = rows[0]
      if (!row) return
      setTitle(row.title)
      setContent(row.content)
      setType(row.type as NoteType)
      setColor((row.color as NoteColor) ?? null)
      if (row.type === 'checklist') {
        setCheckItems(parseChecklistItems(row.content))
      }
      setLoaded(true)
    })
    void assignedLabelIds(id).then(setAssignedIds)
  }, [id, db, assignedLabelIds])

  // Auto-save debounced 500ms
  const save = useCallback(async (t2: string, c2: string, ci: ChecklistItem[], clr: NoteColor) => {
    if (!id || !loaded) return
    const finalContent = type === 'checklist' ? JSON.stringify(ci) : c2
    await db.update(notesTable)
      .set({ title: t2, content: finalContent, color: clr, updatedAt: Date.now() })
      .where(eq(notesTable.id, id))
  }, [id, loaded, type, db])

  useEffect(() => {
    if (!loaded) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      void save(title, content, checkItems, color)
    }, 500)
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    }
  }, [title, content, checkItems, color, loaded, save])

  const handleArchive = useCallback(async () => {
    if (!id) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    await db.update(notesTable).set({ isArchived: true, updatedAt: Date.now() }).where(eq(notesTable.id, id))
    router.back()
  }, [id, db])

  const handleDelete = useCallback(async () => {
    if (!id) return
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    await db.update(notesTable).set({ isTrashed: true, trashedAt: Date.now(), updatedAt: Date.now() }).where(eq(notesTable.id, id))
    router.back()
  }, [id, db])

  const addCheckItem = useCallback(() => {
    const newItem: ChecklistItem = {
      id: `ci_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      text: '',
      isChecked: false,
    }
    setCheckItems(prev => [...prev, newItem])
  }, [])

  const toggleCheck = useCallback((itemId: string) => {
    setCheckItems(prev => prev.map(ci => ci.id === itemId ? { ...ci, isChecked: !ci.isChecked } : ci))
  }, [])

  const updateCheckText = useCallback((itemId: string, text: string) => {
    setCheckItems(prev => prev.map(ci => ci.id === itemId ? { ...ci, text } : ci))
  }, [])

  const removeCheckItem = useCallback((itemId: string) => {
    setCheckItems(prev => prev.filter(ci => ci.id !== itemId))
  }, [])

  const toggleLabelAssign = useCallback(async (labelId: string) => {
    if (assignedIds.includes(labelId)) {
      await unassignLabel(id!, labelId)
      setAssignedIds(prev => prev.filter(l => l !== labelId))
    } else {
      await assignLabel(id!, labelId)
      setAssignedIds(prev => [...prev, labelId])
    }
  }, [assignedIds, id, assignLabel, unassignLabel])

  const bgColor = color ? NOTE_COLORS[color] : t.bg
  const textCol = color ? '#2d0a0a' : t.textPrimary
  const subCol = color ? 'rgba(45,10,10,0.55)' : t.textSecondary

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: bgColor },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10 },
    backBtn: { padding: 8, marginRight: 4 },
    backTxt: { fontSize: typo.lg, color: textCol },
    titleInput: { flex: 1, fontSize: typo.lg, fontWeight: '700', color: textCol, fontFamily: 'Outfit_700Bold' },
    contentInput: { flex: 1, fontSize: typo.sm, color: textCol, fontFamily: 'Lexend_400Regular', lineHeight: 20, textAlignVertical: 'top', paddingHorizontal: 16, paddingBottom: 16, minHeight: 200 },
    checkRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 5, gap: 10 },
    checkBox: { width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: textCol, alignItems: 'center', justifyContent: 'center' },
    checkMark: { fontSize: 13, color: textCol },
    checkInput: { flex: 1, fontSize: typo.sm, color: textCol, fontFamily: 'Lexend_400Regular' },
    checkedText: { textDecorationLine: 'line-through', color: subCol },
    addItemBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 10, gap: 10 },
    addItemTxt: { fontSize: typo.sm, color: subCol, fontFamily: 'Lexend_400Regular' },
    toolbar: { flexDirection: 'row', alignItems: 'center', borderTopWidth: 1, borderTopColor: color ? 'rgba(0,0,0,0.1)' : t.border, paddingHorizontal: 8, paddingVertical: 8, gap: 4 },
    colorRow: { flexDirection: 'row', gap: 6, flex: 1 },
    colorDot: { width: 26, height: 26, borderRadius: 13, borderWidth: 2 },
    toolBtn: { padding: 8, borderRadius: 8 },
    toolBtnTxt: { fontSize: 18 },
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: t.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingBottom: 40, paddingTop: 16, maxHeight: '60%' },
    sheetTitle: { fontSize: typo.md, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold', marginBottom: 12 },
    labelRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: t.surfaceSubtle, gap: 12 },
    labelName: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular' },
    checkCircle: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5 },
    checkCircleOn: { backgroundColor: '#800000', borderColor: '#800000', alignItems: 'center', justifyContent: 'center' },
    checkCircleOff: { borderColor: t.textTertiary },
  }), [t, typo, bgColor, textCol, subCol, color])

  const unchecked = checkItems.filter(ci => !ci.isChecked)
  const checked = checkItems.filter(ci => ci.isChecked)

  return (
    <SafeAreaView style={s.root}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>

        {/* Top bar */}
        <View style={s.topBar}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <Text style={s.backTxt}>‹</Text>
          </TouchableOpacity>
          <TextInput
            style={s.titleInput}
            placeholder="Title"
            placeholderTextColor={subCol}
            value={title}
            onChangeText={setTitle}
            returnKeyType="next"
          />
        </View>

        <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
          {type === 'text' ? (
            <TextInput
              style={s.contentInput}
              placeholder="Note…"
              placeholderTextColor={subCol}
              value={content}
              onChangeText={setContent}
              multiline
              textAlignVertical="top"
            />
          ) : (
            <View>
              {unchecked.map(item => (
                <View key={item.id} style={s.checkRow}>
                  <TouchableOpacity style={s.checkBox} onPress={() => toggleCheck(item.id)}>
                    <Text style={s.checkMark}> </Text>
                  </TouchableOpacity>
                  <TextInput
                    style={s.checkInput}
                    value={item.text}
                    onChangeText={t2 => updateCheckText(item.id, t2)}
                    placeholder="List item…"
                    placeholderTextColor={subCol}
                    onSubmitEditing={addCheckItem}
                    blurOnSubmit={false}
                  />
                  <TouchableOpacity onPress={() => removeCheckItem(item.id)}>
                    <Text style={{ color: subCol, fontSize: 18 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity style={s.addItemBtn} onPress={addCheckItem}>
                <Text style={{ color: subCol, fontSize: 20 }}>+</Text>
                <Text style={s.addItemTxt}>Add item</Text>
              </TouchableOpacity>
              {checked.length > 0 && (
                <>
                  <Text style={{ paddingHorizontal: 16, paddingTop: 8, fontSize: typo.xs, color: subCol, fontFamily: 'Lexend_600SemiBold', textTransform: 'uppercase', letterSpacing: 0.6 }}>
                    {checked.length} checked
                  </Text>
                  {checked.map(item => (
                    <View key={item.id} style={s.checkRow}>
                      <TouchableOpacity style={[s.checkBox, { backgroundColor: subCol }]} onPress={() => toggleCheck(item.id)}>
                        <Text style={s.checkMark}>✓</Text>
                      </TouchableOpacity>
                      <Text style={[s.checkInput, s.checkedText]}>{item.text}</Text>
                      <TouchableOpacity onPress={() => removeCheckItem(item.id)}>
                        <Text style={{ color: subCol, fontSize: 18 }}>✕</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}
            </View>
          )}
        </ScrollView>

        {/* Bottom toolbar */}
        <View style={s.toolbar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            <View style={s.colorRow}>
              {COLOR_KEYS.map(key => (
                <TouchableOpacity
                  key={String(key)}
                  style={[
                    s.colorDot,
                    { backgroundColor: key ? NOTE_COLORS[key] : t.surface },
                    { borderColor: color === key ? '#800000' : (key ? 'rgba(0,0,0,0.2)' : t.border) },
                  ]}
                  onPress={() => setColor(key)}
                />
              ))}
            </View>
          </ScrollView>
          <TouchableOpacity style={s.toolBtn} onPress={() => setShowLabelPicker(true)}>
            <Text style={s.toolBtnTxt}>🏷</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.toolBtn} onPress={handleArchive}>
            <Text style={s.toolBtnTxt}>📦</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.toolBtn} onPress={handleDelete}>
            <Text style={s.toolBtnTxt}>🗑</Text>
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>

      {/* Label picker modal */}
      <Modal visible={showLabelPicker} transparent animationType="slide" onRequestClose={() => setShowLabelPicker(false)}>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setShowLabelPicker(false)}>
          <View style={s.sheet}>
            <Text style={s.sheetTitle}>Labels</Text>
            <ScrollView>
              {labels.length === 0 && (
                <Text style={{ color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.sm }}>
                  No labels yet. Create labels from the Notes screen (🏷 icon).
                </Text>
              )}
              {labels.map(label => {
                const on = assignedIds.includes(label.id)
                return (
                  <TouchableOpacity key={label.id} style={s.labelRow} onPress={() => toggleLabelAssign(label.id)}>
                    <Text style={s.labelName}>{label.name}</Text>
                    <View style={[s.checkCircle, on ? s.checkCircleOn : s.checkCircleOff]}>
                      {on && <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>}
                    </View>
                  </TouchableOpacity>
                )
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  )
}
