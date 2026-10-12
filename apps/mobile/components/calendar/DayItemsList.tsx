import { useMemo } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import type { DayExam, DayReminder } from '../../hooks/useDateReminders'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Trash3Outlined, PlusOutlined } from '@lineiconshq/free-icons'
import { Text } from '../ui/Text'
import { heading } from '../ui/a11y'

interface Props {
  exams: DayExam[]
  reminders: DayReminder[]
  onTapExam: (slug: string) => void
  onTapReminder: (noteId: string) => void
  onTapAdd: () => void
  onDeleteReminder: (noteId: string) => void
}

function formatTime(ms: number): string {
  const d = new Date(ms)
  let h = d.getHours()
  const m = d.getMinutes().toString().padStart(2, '0')
  const ampm = h >= 12 ? 'PM' : 'AM'
  h = h % 12 || 12
  return `${h}:${m} ${ampm}`
}

export function DayItemsList({ exams, reminders, onTapExam, onTapReminder, onTapAdd, onDeleteReminder }: Props) {
  const { theme: t } = useTheme()
  const sortedReminders = useMemo(() => [...reminders].sort((a, b) => a.reminderAt - b.reminderAt), [reminders])

  const styles = useMemo(() => StyleSheet.create({
    container: { paddingVertical: 8, gap: 12 },
    section: { gap: 8 },
    examPill: { backgroundColor: 'rgba(252,165,165,0.12)', borderColor: 'rgba(252,165,165,0.30)', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
    reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface2, borderColor: t.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
    reminderBody: { flex: 1, minWidth: 0 },
    deleteBtn: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
    addBtn: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: t.border, borderStyle: 'dashed' },
  }), [t])

  return (
    <View style={styles.container}>
      {exams.length > 0 && (
        <View style={styles.section}>
          <Text role="footnote" color={t.textSecondary} {...heading(3)} style={{ fontWeight: '600' }}>Important</Text>
          {exams.map(exam => (
            <Pressable
              key={`${exam.slug}-${exam.label}`}
              style={styles.examPill}
              onPress={() => onTapExam(exam.slug)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${exam.title}`}
            >
              <Text role="subheadline" color={t.accentText} style={{ fontWeight: '700' }}>{exam.title}</Text>
              <Text role="footnote" color={t.textSecondary} style={{ marginTop: 2 }}>{exam.label} day · tap to view listing</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text role="footnote" color={t.textSecondary} {...heading(3)} style={{ fontWeight: '600' }}>Your reminders</Text>
        {sortedReminders.length === 0 ? (
          <Text role="subheadline" color={t.textSecondary}>No reminders on this day yet.</Text>
        ) : (
          sortedReminders.map(r => (
            <View key={r.noteId} style={styles.reminderRow}>
              <Pressable
                style={styles.reminderBody}
                onPress={() => onTapReminder(r.noteId)}
                accessibilityRole="button"
                accessibilityLabel={`Open reminder ${r.noteTitle}`}
              >
                <Text role="subheadline" style={{ fontWeight: '600' }}>{r.noteTitle}</Text>
                <Text role="footnote" color={t.textSecondary} style={{ marginTop: 2 }}>
                  {formatTime(r.reminderAt)}{r.type === 'checklist' ? ' · checklist' : ''}
                </Text>
              </Pressable>
              <Pressable
                style={styles.deleteBtn}
                onPress={() => onDeleteReminder(r.noteId)}
                accessibilityRole="button"
                accessibilityLabel={`Delete reminder ${r.noteTitle}`}
              >
                <Lineicons icon={Trash3Outlined} size={16} color={t.textTertiary} />
              </Pressable>
            </View>
          ))
        )}
      </View>

      <Pressable
        style={styles.addBtn}
        onPress={onTapAdd}
        accessibilityRole="button"
        accessibilityLabel="Add a new reminder for this day"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Lineicons icon={PlusOutlined} size={16} color={t.accentText} />
          <Text role="subheadline" color={t.accentText} style={{ fontWeight: '700' }}>Add reminder</Text>
        </View>
      </Pressable>
    </View>
  )
}
