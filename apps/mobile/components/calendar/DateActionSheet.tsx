import { useState, useEffect, useMemo } from 'react'
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native'
import { KeyboardAvoidingView } from 'react-native-keyboard-controller'
import { useTheme } from '../../theme/ThemeContext'
import { useDateReminders } from '../../hooks/useDateReminders'
import { QuickReminderForm, type QuickReminderPayload } from './QuickReminderForm'
import { DayItemsList } from './DayItemsList'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { XmarkOutlined } from '@lineiconshq/free-icons'

interface Props {
  visible: boolean
  dayStartMs: number              // midnight of the selected day (local time)
  onClose: () => void
  onSaveReminder: (payload: QuickReminderPayload) => void
  onSaveAndOpenEditor: (payload: QuickReminderPayload) => void   // NEW
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
  onSaveReminder, onSaveAndOpenEditor, onOpenNoteEditor, onOpenListing, onDeleteReminder,
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
        <KeyboardAvoidingView behavior="padding" style={{ width: '100%' }}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text style={styles.headerTitle}>{formatHeader(dayStartMs)}</Text>
              <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close">
                <Lineicons icon={XmarkOutlined} size={18} color={t.textTertiary} />
              </Pressable>
            </View>
            <ScrollView
              style={{ flexShrink: 1 }}
              contentContainerStyle={{ flexGrow: 0 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {showForm ? (
                <QuickReminderForm
                  dayStartMs={dayStartMs}
                  onSave={onSaveReminder}
                  onOpenEditor={onSaveAndOpenEditor}
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
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  )
}
