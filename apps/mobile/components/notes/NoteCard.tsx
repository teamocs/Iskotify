import { View, Text, Pressable } from 'react-native'
import { Lineicons } from '@lineiconshq/react-native-lineicons'
import { Bell1Outlined, CheckOutlined } from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { decorative, focusRing, type WebPressableState } from '../ui/a11y'
import { parseChecklistItems, type Note } from '../../hooks/useNotes'
import { noteSurface } from './noteTone'

export function formatReminderShort(ms: number, now = new Date()): string {
  const d = new Date(ms)
  const tomorrow = new Date(now); tomorrow.setDate(now.getDate() + 1)
  const time = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  if (d.toDateString() === now.toDateString()) return `Today ${time}`
  if (d.toDateString() === tomorrow.toDateString()) return `Tomorrow ${time}`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ` ${time}`
}

interface Props {
  note: Note
  /** Opens the note. Omit for a read-only preview (trash). */
  onPress?: () => void
  onLongPress?: () => void
  /** Selection mode: whether this card is selected (aria-selected). Undefined outside selection. */
  selected?: boolean
  /** Extra controls under the preview (archive / trash rows). */
  footer?: React.ReactNode
}

/**
 * A note preview: title, a few lines (or checklist items drawn with real
 * boxes), and the upcoming reminder. The whole card is one button; its paper
 * colour comes from theme tokens via noteSurface().
 */
export function NoteCard({ note, onPress, onLongPress, selected, footer }: Props) {
  const { theme: t } = useTheme()
  const hasReminder = note.reminderAt != null && note.reminderAt > Date.now()
  const items = note.type === 'checklist' ? parseChecklistItems(note.content) : []
  const name = note.title || 'Untitled note'

  const body = (
    <>
      {note.title.length > 0 ? (
        <Text style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={2}>{note.title}</Text>
      ) : null}
      {note.type === 'text' && note.content.length > 0 ? (
        <Text style={textStyle('bodySm', t.textSecondary)} numberOfLines={6} maxFontSizeMultiplier={2}>
          {note.content}
        </Text>
      ) : null}
      {note.type === 'checklist' && items.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          {items.slice(0, 5).map(item => (
            <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
              <View
                {...decorative}
                style={{
                  width: 14, height: 14, borderRadius: 3, borderWidth: 1.5,
                  borderColor: item.isChecked ? t.textSecondary : t.inputBorder,
                  backgroundColor: item.isChecked ? t.textSecondary : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {item.isChecked ? <Lineicons icon={CheckOutlined} size={10} color={t.surface} /> : null}
              </View>
              <Text
                style={[
                  textStyle('bodySm', item.isChecked ? t.textSecondary : t.textPrimary),
                  { flex: 1, textDecorationLine: item.isChecked ? 'line-through' : 'none' },
                ]}
                numberOfLines={1}
                maxFontSizeMultiplier={2}
              >
                {item.text}
              </Text>
            </View>
          ))}
          {items.length > 5 ? (
            <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={2}>
              {items.length - 5} more
            </Text>
          ) : null}
        </View>
      ) : null}
      {hasReminder ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs }}>
          <View {...decorative}><Lineicons icon={Bell1Outlined} size={12} color={t.textSecondary} /></View>
          <Text style={textStyle('caption', t.textSecondary)} maxFontSizeMultiplier={2}>
            {formatReminderShort(note.reminderAt!)}
          </Text>
        </View>
      ) : null}
    </>
  )

  const frame = {
    backgroundColor: noteSurface(t, note.color),
    borderRadius: radius.lg,
    borderCurve: 'continuous' as const,
    borderWidth: selected ? 2 : 1,
    borderColor: selected ? t.accent : t.border,
  }

  if (!onPress) {
    return (
      <View style={frame}>
        <View style={{ padding: spacing.lg, gap: spacing.sm }}>{body}</View>
        {footer ? <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>{footer}</View> : null}
      </View>
    )
  }

  return (
    <View style={frame}>
      <Pressable
        onPress={onPress}
        onLongPress={onLongPress}
        accessibilityRole="button"
        accessibilityLabel={name}
        accessibilityHint={onLongPress ? 'Opens the note. Long press to select.' : 'Opens the note.'}
        aria-selected={selected}
        style={(state) => {
          const { pressed, hovered, focused } = state as WebPressableState
          return [
            {
              minHeight: 44,
              padding: spacing.lg,
              gap: spacing.sm,
              borderRadius: radius.lg,
              backgroundColor: pressed || hovered ? t.surfaceSubtle : 'transparent',
            },
            focusRing(t.focusRing, focused),
          ]
        }}
      >
        {body}
      </Pressable>
      {footer ? <View style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md }}>{footer}</View> : null}
    </View>
  )
}
