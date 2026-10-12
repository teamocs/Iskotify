import { useState, useEffect } from 'react'
import { useDateReminders } from '../../hooks/useDateReminders'
import { Sheet } from '../ui/Sheet'
import { QuickReminderForm, type QuickReminderPayload } from './QuickReminderForm'
import { DayItemsList } from './DayItemsList'

interface Props {
  visible: boolean
  dayStartMs: number              // midnight of the selected day (local time)
  onClose: () => void
  onSaveReminder: (payload: QuickReminderPayload) => void
  onSaveAndOpenEditor: (payload: QuickReminderPayload) => void
  onOpenNoteEditor: (noteId: string) => void
  onOpenListing: (slug: string) => void
  onDeleteReminder: (noteId: string) => void
}

function formatHeader(dayStartMs: number): string {
  return new Date(dayStartMs).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
  })
}

/**
 * One day of the calendar, on the P3 Sheet (enter/exit motion, Back/Escape,
 * keyboard lift, modal semantics): the day's exams and reminders, or the
 * quick reminder form when the day is empty.
 */
export function DateActionSheet({
  visible, dayStartMs, onClose,
  onSaveReminder, onSaveAndOpenEditor, onOpenNoteEditor, onOpenListing, onDeleteReminder,
}: Props) {
  const day = useDateReminders(visible ? dayStartMs : null)
  const hasItems = day.exams.length > 0 || day.reminders.length > 0
  const [forceForm, setForceForm] = useState(false)

  // Reset forceForm whenever a new day is opened
  useEffect(() => {
    if (visible) setForceForm(false)
  }, [visible, dayStartMs])

  const showForm = !hasItems || forceForm

  return (
    <Sheet visible={visible} title={formatHeader(dayStartMs)} onClose={onClose}>
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
    </Sheet>
  )
}
