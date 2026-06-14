import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Modal, KeyboardAvoidingView, Platform, Alert,
} from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { Stack, router, useLocalSearchParams } from 'expo-router'
import { eq } from 'drizzle-orm'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import {
  BoxArchive1Outlined,
  Trash3Outlined,
  Bookmark1Outlined,
  Bell1Outlined,
  Bell1Solid,
  CheckOutlined,
  XmarkOutlined,
  Alarm1Outlined,
} from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { useDb } from '../../hooks/useDb'
import { useNoteLabels } from '../../hooks/useNoteLabels'
import { NOTE_COLORS, parseChecklistItems, type NoteColor, type NoteType, type ChecklistItem } from '../../hooks/useNotes'
import { notes as notesTable } from '../../db/schema'
import { scheduleNoteReminder, cancelNoteReminder } from '../../services/notifications'

const COLOR_KEYS = [null, 'red', 'pink', 'orange', 'yellow', 'teal', 'green', 'cyan', 'blue', 'cerulean', 'purple', 'gray'] as const

// ── Reminder quick-pick options ──────────────────────────────────────────────

function getReminderOptions(): Array<{ label: string; sub: string; ms: number | null }> {
  const now = new Date()
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000)
  const tonight = new Date(now); tonight.setHours(21, 0, 0, 0)
  const tomorrow9 = new Date(now); tomorrow9.setDate(now.getDate() + 1); tomorrow9.setHours(9, 0, 0, 0)
  const nextMonday = new Date(now)
  const daysUntilMon = (8 - now.getDay()) % 7 || 7
  nextMonday.setDate(now.getDate() + daysUntilMon); nextMonday.setHours(9, 0, 0, 0)

  const opts: Array<{ label: string; sub: string; ms: number | null }> = []
  if (inOneHour > now) opts.push({ label: 'In 1 hour', sub: inOneHour.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), ms: inOneHour.getTime() })
  if (tonight > now) opts.push({ label: 'Tonight', sub: '9:00 PM', ms: tonight.getTime() })
  opts.push({ label: 'Tomorrow morning', sub: tomorrow9.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' · 9:00 AM', ms: tomorrow9.getTime() })
  opts.push({ label: 'Next week', sub: nextMonday.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) + ' · 9:00 AM', ms: nextMonday.getTime() })
  return opts
}

function formatReminderFull(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ── Main component ───────────────────────────────────────────────────────────

export default function NoteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { theme: t, typo } = useTheme()
  const insets = useSafeAreaInsets()
  const db = useDb()
  const { labels, assignedLabelIds, assignLabel, unassignLabel } = useNoteLabels()

  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [type, setType] = useState<NoteType>('text')
  const [color, setColor] = useState<NoteColor>(null)
  const [checkItems, setCheckItems] = useState<ChecklistItem[]>([])
  const [showLabelPicker, setShowLabelPicker] = useState(false)
  const [showReminderPicker, setShowReminderPicker] = useState(false)
  const [assignedIds, setAssignedIds] = useState<string[]>([])
  const [reminderAt, setReminderAt] = useState<number | null>(null)
  const [loaded, setLoaded] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reminderOpts = useMemo(() => getReminderOptions(), [])

  // Load note on mount
  useEffect(() => {
    if (!id) return
    let cancelled = false
    void db.select().from(notesTable).where(eq(notesTable.id, id)).limit(1).then(rows => {
      if (cancelled) return
      const row = rows[0]
      if (!row) return
      setTitle(row.title)
      setContent(row.content)
      setType(row.type as NoteType)
      setColor((row.color as NoteColor) ?? null)
      setReminderAt(row.reminderAt ?? null)
      if (row.type === 'checklist') {
        setCheckItems(parseChecklistItems(row.content))
      }
      setLoaded(true)
    })
    void assignedLabelIds(id).then(ids => { if (!cancelled) setAssignedIds(ids) })
    return () => { cancelled = true }
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
    Alert.alert('Move to Trash', 'Move this note to trash?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Move to Trash', style: 'destructive',
        onPress: async () => {
          if (!id) return
          if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
          await db.update(notesTable).set({ isTrashed: true, trashedAt: Date.now(), updatedAt: Date.now() }).where(eq(notesTable.id, id))
          router.back()
        },
      },
    ])
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

  const handleSetReminder = useCallback(async (ms: number | null) => {
    if (!id) return
    setReminderAt(ms)
    setShowReminderPicker(false)
    await db.update(notesTable)
      .set({ reminderAt: ms, updatedAt: Date.now() })
      .where(eq(notesTable.id, id))
    if (ms != null) {
      await scheduleNoteReminder(id, title, new Date(ms))
    } else {
      await cancelNoteReminder(id)
    }
  }, [id, db, title])

  const bgColor = color ? NOTE_COLORS[color] : t.bg
  const textCol = color ? '#2d0a0a' : t.textPrimary
  const subCol = color ? 'rgba(45,10,10,0.55)' : t.textSecondary
  const now = Date.now()
  const hasActiveReminder = reminderAt != null && reminderAt > now

  const s = useMemo(() => StyleSheet.create({
    root: { flex: 1, backgroundColor: bgColor },
    topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    backBtn: { padding: 8 },
    backTxt: { fontSize: typo.lg, color: textCol },
    titleInput: { flex: 1, fontSize: typo.lg, fontWeight: '700', color: textCol, fontFamily: 'Outfit_700Bold' },
    reminderBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginHorizontal: 16, marginBottom: 6, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: hasActiveReminder ? 'rgba(128,0,0,0.08)' : 'transparent', borderRadius: 10, borderWidth: hasActiveReminder ? 1 : 0, borderColor: 'rgba(128,0,0,0.2)', alignSelf: 'flex-start' },
    reminderBadgeTxt: { fontSize: typo.xs, color: '#800000', fontFamily: 'Lexend_500Medium' },
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
    toolBtn: { padding: 10, borderRadius: 10 },
    toolBtnActive: { backgroundColor: 'rgba(128,0,0,0.1)' },
    // Sheet shared styles
    backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)' },
    sheet: { backgroundColor: t.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingBottom: Math.max(32, insets.bottom + 16), paddingTop: 12 },
    sheetHandle: { width: 36, height: 4, backgroundColor: t.divider, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, marginBottom: 16 },
    sheetTitle: { fontSize: typo.lg, fontWeight: '700', color: t.textPrimary, fontFamily: 'Outfit_700Bold' },
    sheetCloseBtn: { padding: 4 },
    // Label picker
    labelRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: t.surfaceSubtle, gap: 12 },
    labelName: { flex: 1, fontSize: typo.sm, color: t.textPrimary, fontFamily: 'Lexend_400Regular' },
    checkCircle: { width: 24, height: 24, borderRadius: 12, borderWidth: 1.5 },
    checkCircleOn: { backgroundColor: t.accent, borderColor: t.accent, alignItems: 'center', justifyContent: 'center' },
    checkCircleOff: { borderColor: t.textTertiary },
    // Reminder picker
    reminderOpt: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: t.surfaceSubtle, gap: 14 },
    reminderOptIconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: t.surface2, borderWidth: 1, borderColor: t.border, alignItems: 'center', justifyContent: 'center' },
    reminderOptLabel: { fontSize: typo.md, fontWeight: '600', color: t.textPrimary, fontFamily: 'Outfit_600SemiBold' },
    reminderOptSub: { fontSize: typo.xs, color: t.textTertiary, fontFamily: 'Lexend_400Regular', marginTop: 1 },
    clearReminderBtn: { marginHorizontal: 20, marginTop: 12, paddingVertical: 14, borderRadius: 14, backgroundColor: 'rgba(248,113,113,0.08)', borderWidth: 1, borderColor: 'rgba(248,113,113,0.3)', alignItems: 'center' },
    clearReminderTxt: { fontSize: typo.sm, color: '#f87171', fontFamily: 'Lexend_500Medium' },
  }), [t, typo, bgColor, textCol, subCol, color, insets, hasActiveReminder])

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

        {/* Active reminder badge */}
        {hasActiveReminder && (
          <TouchableOpacity style={s.reminderBadge} onPress={() => setShowReminderPicker(true)}>
            <Lineicons icon={Bell1Solid} size={12} color="#800000" />
            <Text style={s.reminderBadgeTxt}>{formatReminderFull(reminderAt!)}</Text>
          </TouchableOpacity>
        )}

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
                    <Lineicons icon={XmarkOutlined} size={16} color={subCol} />
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
                        <Lineicons icon={XmarkOutlined} size={16} color={subCol} />
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
          {/* Reminder */}
          <TouchableOpacity style={[s.toolBtn, hasActiveReminder && s.toolBtnActive]} onPress={() => setShowReminderPicker(true)}>
            <Lineicons icon={hasActiveReminder ? Bell1Solid : Bell1Outlined} size={20} color={hasActiveReminder ? '#800000' : textCol} />
          </TouchableOpacity>
          {/* Labels */}
          <TouchableOpacity style={[s.toolBtn, assignedIds.length > 0 && s.toolBtnActive]} onPress={() => setShowLabelPicker(true)}>
            <Lineicons icon={Bookmark1Outlined} size={20} color={assignedIds.length > 0 ? '#800000' : textCol} />
          </TouchableOpacity>
          {/* Archive */}
          <TouchableOpacity style={s.toolBtn} onPress={handleArchive}>
            <Lineicons icon={BoxArchive1Outlined} size={20} color={textCol} />
          </TouchableOpacity>
          {/* Trash */}
          <TouchableOpacity style={s.toolBtn} onPress={handleDelete}>
            <Lineicons icon={Trash3Outlined} size={20} color="#f87171" />
          </TouchableOpacity>
        </View>

      </KeyboardAvoidingView>

      {/* ── Label picker bottom sheet ─────────────────────────────────────── */}
      <Modal visible={showLabelPicker} transparent animationType="slide" onRequestClose={() => setShowLabelPicker(false)} statusBarTranslucent>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setShowLabelPicker(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Labels</Text>
            <TouchableOpacity style={s.sheetCloseBtn} onPress={() => setShowLabelPicker(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Lineicons icon={XmarkOutlined} size={18} color={t.textTertiary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 380 }}>
            {labels.length === 0 && (
              <Text style={{ color: t.textTertiary, fontFamily: 'Lexend_400Regular', fontSize: typo.sm, paddingHorizontal: 20, paddingVertical: 12 }}>
                No labels yet. Create labels from the Notes screen (label icon).
              </Text>
            )}
            {labels.map(label => {
              const on = assignedIds.includes(label.id)
              return (
                <TouchableOpacity key={label.id} style={s.labelRow} onPress={() => void toggleLabelAssign(label.id)}>
                  <Text style={s.labelName}>{label.name}</Text>
                  <View style={[s.checkCircle, on ? s.checkCircleOn : s.checkCircleOff]}>
                    {on && <Lineicons icon={CheckOutlined} size={12} color="#fff" />}
                  </View>
                </TouchableOpacity>
              )
            })}
          </ScrollView>
        </View>
      </Modal>

      {/* ── Reminder picker bottom sheet ──────────────────────────────────── */}
      <Modal visible={showReminderPicker} transparent animationType="slide" onRequestClose={() => setShowReminderPicker(false)} statusBarTranslucent>
        <TouchableOpacity style={s.backdrop} activeOpacity={1} onPress={() => setShowReminderPicker(false)} />
        <View style={s.sheet}>
          <View style={s.sheetHandle} />
          <View style={s.sheetHeader}>
            <Text style={s.sheetTitle}>Set Reminder</Text>
            <TouchableOpacity style={s.sheetCloseBtn} onPress={() => setShowReminderPicker(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Lineicons icon={XmarkOutlined} size={18} color={t.textTertiary} />
            </TouchableOpacity>
          </View>
          <ScrollView style={{ maxHeight: 420 }}>
            {reminderOpts.map((opt, i) => (
              <TouchableOpacity key={i} style={[s.reminderOpt, i === reminderOpts.length - 1 && { borderBottomWidth: 0 }]} onPress={() => opt.ms != null && void handleSetReminder(opt.ms)}>
                <View style={s.reminderOptIconWrap}>
                  <Lineicons icon={Alarm1Outlined} size={20} color="#800000" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.reminderOptLabel}>{opt.label}</Text>
                  <Text style={s.reminderOptSub}>{opt.sub}</Text>
                </View>
                {reminderAt != null && opt.ms === reminderAt && (
                  <Lineicons icon={CheckOutlined} size={16} color="#800000" />
                )}
              </TouchableOpacity>
            ))}
            {hasActiveReminder && (
              <TouchableOpacity style={s.clearReminderBtn} onPress={() => void handleSetReminder(null)}>
                <Text style={s.clearReminderTxt}>Remove reminder</Text>
              </TouchableOpacity>
            )}
          </ScrollView>
        </View>
      </Modal>
    </SafeAreaView>
  )
}
