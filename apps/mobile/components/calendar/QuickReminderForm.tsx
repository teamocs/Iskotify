import { useState, useMemo } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'

export interface QuickReminderPayload {
  title: string
  type: 'text' | 'checklist'
  content: string           // raw text OR JSON-encoded checklist items
  reminderAt: number        // ms epoch (noon of dayStartMs by default)
}

interface ChecklistItem {
  id: string
  text: string
  isChecked: boolean
}

interface Props {
  dayStartMs: number                                  // midnight of the selected day
  onSave: (payload: QuickReminderPayload) => void
  onOpenEditor: (payload: QuickReminderPayload) => void
  onCancel?: () => void
}

function noonOfDay(dayStartMs: number): number {
  const d = new Date(dayStartMs)
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime()
}

function makeChecklistId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function QuickReminderForm({ dayStartMs, onSave, onOpenEditor, onCancel }: Props) {
  const { theme: t, typo } = useTheme()
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<'text' | 'checklist'>('text')
  const [textContent, setTextContent] = useState('')
  const [items, setItems] = useState<ChecklistItem[]>([{ id: makeChecklistId(), text: '', isChecked: false }])

  const reminderAt = useMemo(() => noonOfDay(dayStartMs), [dayStartMs])
  const canSave = title.trim().length > 0

  const styles = useMemo(() => StyleSheet.create({
    container: { padding: 16, gap: 12 },
    label: { fontSize: typo.xs, color: t.textTertiary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    input: { backgroundColor: t.surface2, borderColor: t.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, color: t.textPrimary, fontSize: typo.md },
    contentInput: { minHeight: 80, textAlignVertical: 'top' },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    itemInput: { flex: 1, backgroundColor: t.surface2, borderColor: t.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, color: t.textPrimary, fontSize: typo.md },
    addChecklistBtn: { paddingVertical: 6, alignSelf: 'flex-start' },
    addChecklistTxt: { color: t.accentText, fontSize: typo.sm, fontWeight: '600' },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    timeChip: { backgroundColor: t.surface2, borderColor: t.border, borderWidth: 1, borderRadius: 980, paddingHorizontal: 12, paddingVertical: 6 },
    timeTxt: { color: t.textSecondary, fontSize: typo.sm, fontWeight: '600' },
    btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
    btnSecondary: { backgroundColor: 'transparent', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 980 },
    btnSecondaryTxt: { color: t.textSecondary, fontSize: typo.sm, fontWeight: '600' },
    btnPrimary: { backgroundColor: t.accent, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 980 },
    btnPrimaryTxt: { color: '#fff', fontSize: typo.sm, fontWeight: '700' },
    btnDisabled: { opacity: 0.4 },
  }), [t, typo])

  function buildPayload(): QuickReminderPayload {
    const trimmedTitle = title.trim()
    if (mode === 'checklist') {
      const cleanItems = items.filter(i => i.text.trim() !== '')
      return { title: trimmedTitle, type: 'checklist', content: JSON.stringify(cleanItems), reminderAt }
    }
    return { title: trimmedTitle, type: 'text', content: textContent, reminderAt }
  }

  function handleSave() {
    if (!canSave) return
    onSave(buildPayload())
  }

  function handleOpenEditor() {
    onOpenEditor(buildPayload())
  }

  function updateItem(id: string, text: string) {
    setItems(prev => {
      const next = prev.map(i => (i.id === id ? { ...i, text } : i))
      if (next.length === 0 || next[next.length - 1]!.text.trim() !== '') {
        next.push({ id: makeChecklistId(), text: '', isChecked: false })
      }
      return next
    })
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Title</Text>
      <TextInput
        style={styles.input}
        placeholder="What's the reminder?"
        placeholderTextColor={t.textTertiary}
        value={title}
        onChangeText={setTitle}
        autoFocus
      />

      {mode === 'text' ? (
        <>
          <Text style={styles.label}>Content (optional)</Text>
          <TextInput
            style={[styles.input, styles.contentInput]}
            placeholder="Content (optional)"
            placeholderTextColor={t.textTertiary}
            value={textContent}
            onChangeText={setTextContent}
            multiline
          />
          <Pressable onPress={() => setMode('checklist')} style={styles.addChecklistBtn}>
            <Text style={styles.addChecklistTxt}>+ Add checklist</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text style={styles.label}>Items</Text>
          {items.map((item, i) => (
            <View key={item.id} style={styles.itemRow}>
              <TextInput
                style={styles.itemInput}
                placeholder={i === 0 ? 'First item' : 'Add another'}
                placeholderTextColor={t.textTertiary}
                value={item.text}
                onChangeText={txt => updateItem(item.id, txt)}
              />
            </View>
          ))}
        </>
      )}

      <View style={styles.timeRow}>
        <View style={styles.timeChip}>
          <Text style={styles.timeTxt}>⏰ 12:00 PM</Text>
        </View>
        <Text style={{ color: t.textTertiary, fontSize: typo.xs }}>
          (custom time available in full editor)
        </Text>
      </View>

      <View style={styles.btnRow}>
        {onCancel && (
          <Pressable onPress={onCancel} style={styles.btnSecondary}>
            <Text style={styles.btnSecondaryTxt}>Cancel</Text>
          </Pressable>
        )}
        <Pressable onPress={handleOpenEditor} style={styles.btnSecondary}>
          <Text style={styles.btnSecondaryTxt}>Open in editor</Text>
        </Pressable>
        <Pressable
          onPress={handleSave}
          style={[styles.btnPrimary, !canSave && styles.btnDisabled]}
          disabled={!canSave}
        >
          <Text style={styles.btnPrimaryTxt}>Save</Text>
        </Pressable>
      </View>
    </View>
  )
}
