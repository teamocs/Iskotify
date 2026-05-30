import { useState, useEffect, useMemo } from 'react'
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import { useDateReminders } from '../../hooks/useDateReminders'
import { QuickReminderForm, type QuickReminderPayload } from './QuickReminderForm'
import { DayItemsList } from './DayItemsList'

interface Props {
  visible: boolean
  dayStartMs: number              // midnight of the selected day (local time)
  onClose: () => void
  onSaveReminder: (payload: QuickReminderPayload) => void
  onOpenNoteEditor: (noteId: string) => void
  onOpenListing: (slug: string) => void
  onDeleteReminder: (noteId: string) => void
}

function formatHeader(dayStartMs: number): string {
  return new Date(dayStartMs).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

export function DateActionSheet({
  visible, dayStartMs, onClose,
  onSaveReminder, onOpenNoteEditor, onOpenListing, onDeleteReminder,
}: Props) {
  const { theme: t, typo } = useTheme()
  const day = useDateReminders(visible ? dayStartMs : null)
  const hasItems = day.exams.length > 0 || day.reminders.length > 0
  const [forceForm, setForceForm] = useState(false)

  // Reset forceForm whenever a new day is opened
  useEffect(() => {
    if (visible) setForceForm(false)
  }, [visible, dayStartMs])

  const showForm = !hasItems || forceForm

  const styles = useMemo(() => StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: t.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '85%' },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginVertical: 8 },
    header: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { color: t.textPrimary, fontSize: typo.lg, fontWeight: '700' },
    closeBtn: { padding: 6 },
    closeTxt: { color: t.textTertiary, fontSize: typo.lg },
  }), [t, typo])

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.headerTitle}>{formatHeader(dayStartMs)}</Text>
            <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
              <Text style={styles.closeTxt}>✕</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled">
            {showForm ? (
              <QuickReminderForm
                dayStartMs={dayStartMs}
                onSave={onSaveReminder}
                onOpenEditor={onSaveReminder}
                onCancel={hasItems ? () => setForceForm(false) : undefined}
              />
            ) : (
              <DayItemsList
                exams={day.exams}
                reminders={day.reminders}
                onTapExam={onOpenListing}
                onTapReminder={onOpenNoteEditor}
                onTapAdd={() => setForceForm(true)}
                onDeleteReminder={onDeleteReminder}
              />
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
