import { useState, useMemo } from 'react'
import { View, TextInput, Pressable, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Alarm1Outlined } from '@lineiconshq/free-icons'
import { iosTextStyle } from '../../theme/tokens'
import { Text } from '../ui/Text'

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
  const { theme: t } = useTheme()
  const [title, setTitle] = useState('')
  const [mode, setMode] = useState<'text' | 'checklist'>('text')
  const [textContent, setTextContent] = useState('')
  const [items, setItems] = useState<ChecklistItem[]>([{ id: makeChecklistId(), text: '', isChecked: false }])

  const reminderAt = useMemo(() => noonOfDay(dayStartMs), [dayStartMs])
  const canSave = title.trim().length > 0

  const styles = useMemo(() => StyleSheet.create({
    container: { paddingVertical: 8, gap: 12 },
    input: { backgroundColor: t.surface2, borderColor: t.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, ...iosTextStyle('body', t.textPrimary) },
    contentInput: { minHeight: 80, textAlignVertical: 'top' },
    itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    itemInput: { flex: 1, backgroundColor: t.surface2, borderColor: t.border, borderWidth: 1, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, ...iosTextStyle('body', t.textPrimary) },
    addChecklistBtn: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
    timeRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    timeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: t.surface2, borderColor: t.border, borderWidth: 1, borderRadius: 980, paddingHorizontal: 12, paddingVertical: 6 },
    btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
    btnSecondary: { backgroundColor: 'transparent', paddingHorizontal: 14, minHeight: 44, justifyContent: 'center', borderRadius: 980 },
    btnPrimary: { backgroundColor: t.accent, paddingHorizontal: 16, minHeight: 44, justifyContent: 'center', borderRadius: 980 },
    btnDisabled: { opacity: 0.4 },
  }), [t])

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
      <Text role="footnote" color={t.textSecondary} style={{ fontWeight: '600' }}>Title</Text>
      <TextInput
        style={styles.input}
        placeholder="What's the reminder?"
        placeholderTextColor={t.textTertiary}
        value={title}
        onChangeText={setTitle}
        accessibilityLabel="Title"
        // No autoFocus: it would race the Sheet moving screen-reader focus to its title.
      />

      {mode === 'text' ? (
        <>
          <Text role="footnote" color={t.textSecondary} style={{ fontWeight: '600' }}>Content (optional)</Text>
          <TextInput
            style={[styles.input, styles.contentInput]}
            placeholder="Content (optional)"
            placeholderTextColor={t.textTertiary}
            value={textContent}
            onChangeText={setTextContent}
            accessibilityLabel="Content (optional)"
            multiline
          />
          <Pressable onPress={() => setMode('checklist')} style={styles.addChecklistBtn}>
            <Text role="subheadline" color={t.accentText} style={{ fontWeight: '600' }}>+ Add checklist</Text>
          </Pressable>
        </>
      ) : (
        <>
          <Text role="footnote" color={t.textSecondary} style={{ fontWeight: '600' }}>Items</Text>
          {items.map((item, i) => (
            <View key={item.id} style={styles.itemRow}>
              <TextInput
                style={styles.itemInput}
                placeholder={i === 0 ? 'First item' : 'Add another'}
                placeholderTextColor={t.textTertiary}
                value={item.text}
                onChangeText={txt => updateItem(item.id, txt)}
                accessibilityLabel={`Item ${i + 1}`}
              />
            </View>
          ))}
        </>
      )}

      <View style={styles.timeRow}>
        <View style={styles.timeChip}>
          <Lineicons icon={Alarm1Outlined} size={14} color={t.textSecondary} />
          <Text role="subheadline" color={t.textSecondary} style={{ fontWeight: '600' }}>12:00 PM</Text>
        </View>
        <Text role="footnote" color={t.textSecondary} style={{ flexShrink: 1 }}>
          (custom time available in full editor)
        </Text>
      </View>

      <View style={styles.btnRow}>
        {onCancel && (
          <Pressable onPress={onCancel} style={styles.btnSecondary}>
            <Text role="subheadline" color={t.textSecondary} style={{ fontWeight: '600' }}>Cancel</Text>
          </Pressable>
        )}
        <Pressable onPress={handleOpenEditor} style={styles.btnSecondary}>
          <Text role="subheadline" color={t.textSecondary} style={{ fontWeight: '600' }}>Open in editor</Text>
        </Pressable>
        <Pressable
          onPress={handleSave}
          style={[styles.btnPrimary, !canSave && styles.btnDisabled]}
          disabled={!canSave}
        >
          <Text role="subheadline" color={t.textInverse} style={{ fontWeight: '700' }}>Save</Text>
        </Pressable>
      </View>
    </View>
  )
}
