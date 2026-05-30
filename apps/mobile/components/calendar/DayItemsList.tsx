import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import type { DayExam, DayReminder } from '../../hooks/useDateReminders'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Trash3Outlined, PlusOutlined } from '@lineiconshq/free-icons'

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
  const { theme: t, typo } = useTheme()
  const sortedReminders = useMemo(() => [...reminders].sort((a, b) => a.reminderAt - b.reminderAt), [reminders])

  const styles = useMemo(() => StyleSheet.create({
    container: { padding: 16, gap: 12 },
    section: { gap: 8 },
    label: { fontSize: typo.xs, color: t.textTertiary, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 },
    examPill: { backgroundColor: 'rgba(252,165,165,0.12)', borderColor: 'rgba(252,165,165,0.30)', borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
    examTitle: { color: t.accentText, fontSize: typo.sm, fontWeight: '700' },
    examMeta: { color: t.textSecondary, fontSize: typo.xs, marginTop: 2 },
    reminderRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: t.surface2, borderColor: t.border, borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
    reminderBody: { flex: 1, minWidth: 0 },
    reminderTitle: { color: t.textPrimary, fontSize: typo.sm, fontWeight: '600' },
    reminderTime: { color: t.textTertiary, fontSize: typo.xs, marginTop: 2 },
    deleteBtn: { paddingHorizontal: 6, paddingVertical: 4 },
    addBtn: { alignSelf: 'stretch', alignItems: 'center', paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: t.border, borderStyle: 'dashed' },
    addTxt: { color: t.accentText, fontSize: typo.sm, fontWeight: '700' },
    empty: { color: t.textTertiary, fontSize: typo.sm, fontStyle: 'italic' },
  }), [t, typo])

  return (
    <View style={styles.container}>
      {exams.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.label}>Important</Text>
          {exams.map(exam => (
            <Pressable
              key={`${exam.slug}-${exam.label}`}
              style={styles.examPill}
              onPress={() => onTapExam(exam.slug)}
              accessibilityRole="button"
              accessibilityLabel={`Open ${exam.title}`}
            >
              <Text style={styles.examTitle}>{exam.title}</Text>
              <Text style={styles.examMeta}>{exam.label} day · tap to view listing</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <Text style={styles.label}>Your reminders</Text>
        {sortedReminders.length === 0 ? (
          <Text style={styles.empty}>No reminders on this day yet.</Text>
        ) : (
          sortedReminders.map(r => (
            <View key={r.noteId} style={styles.reminderRow}>
              <Pressable
                style={styles.reminderBody}
                onPress={() => onTapReminder(r.noteId)}
                accessibilityRole="button"
                accessibilityLabel={`Open reminder ${r.noteTitle}`}
              >
                <Text style={styles.reminderTitle}>{r.noteTitle}</Text>
                <Text style={styles.reminderTime}>
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
          <Text style={styles.addTxt}>Add reminder</Text>
        </View>
      </Pressable>
    </View>
  )
}
