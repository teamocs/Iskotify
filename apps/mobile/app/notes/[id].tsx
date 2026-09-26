import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { View, Text, TextInput, ScrollView, Pressable, KeyboardAvoidingView, Platform } from 'react-native'
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
  PlusOutlined,
  FileQuestionOutlined,
} from '@lineiconshq/free-icons'
import { useTheme } from '../../theme/ThemeContext'
import { radius, spacing, textStyle } from '../../theme/tokens'
import { useDb } from '../../hooks/useDb'
import { useNoteLabels } from '../../hooks/useNoteLabels'
import { useSafeInsets } from '../../hooks/useSafeInsets'
import { parseChecklistItems, type NoteColor, type NoteType, type ChecklistItem } from '../../hooks/useNotes'
import { notes as notesTable } from '../../db/schema'
import { scheduleNoteReminder, cancelNoteReminder } from '../../services/notifications'
import { confirmAction } from '../../utils/confirmAction'
import { Screen } from '../../components/ui/Screen'
import { Sheet } from '../../components/ui/Sheet'
import { Button } from '../../components/ui/Button'
import { Skeleton } from '../../components/ui/Skeleton'
import { EmptyState } from '../../components/ui/EmptyState'
import { decorative, focusRing, type WebPressableState } from '../../components/ui/a11y'
import { DetailTopBar, goBackOr } from '../../components/explore/DetailTopBar'
import { NOTE_SWATCHES, noteSurface, noteSwatchBorder, noteTone } from '../../components/notes/noteTone'

// ── Reminder quick-pick options ──────────────────────────────────────────────

function getReminderOptions(): { label: string; sub: string; ms: number }[] {
  const now = new Date()
  const inOneHour = new Date(now.getTime() + 60 * 60 * 1000)
  const tonight = new Date(now); tonight.setHours(21, 0, 0, 0)
  const tomorrow9 = new Date(now); tomorrow9.setDate(now.getDate() + 1); tomorrow9.setHours(9, 0, 0, 0)
  const nextMonday = new Date(now)
  const daysUntilMon = (8 - now.getDay()) % 7 || 7
  nextMonday.setDate(now.getDate() + daysUntilMon); nextMonday.setHours(9, 0, 0, 0)

  const opts: { label: string; sub: string; ms: number }[] = []
  opts.push({ label: 'In 1 hour', sub: inOneHour.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }), ms: inOneHour.getTime() })
  if (tonight > now) opts.push({ label: 'Tonight', sub: '9:00 PM', ms: tonight.getTime() })
  opts.push({ label: 'Tomorrow morning', sub: tomorrow9.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ', 9:00 AM', ms: tomorrow9.getTime() })
  opts.push({ label: 'Next week', sub: nextMonday.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }) + ', 9:00 AM', ms: nextMonday.getTime() })
  return opts
}

function formatReminderFull(ms: number): string {
  const d = new Date(ms)
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) +
    ' at ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

// ── Small controls ───────────────────────────────────────────────────────────

/** 44pt icon button with a spoken name and a keyboard focus ring. */
function ToolButton({ label, onPress, active, children }: {
  label: string
  onPress: () => void
  active?: boolean
  children: React.ReactNode
}) {
  const { theme: t } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={(state) => {
        const { pressed, hovered, focused } = state as WebPressableState
        return [
          {
            width: 44, height: 44, borderRadius: radius.md, borderCurve: 'continuous',
            alignItems: 'center', justifyContent: 'center',
            backgroundColor: active ? t.accentSurface : pressed || hovered ? t.surface2 : 'transparent',
          },
          focusRing(t.focusRing, focused),
        ]
      }}
    >
      <View {...decorative}>{children}</View>
    </Pressable>
  )
}

/** A checklist tick box: 44pt target, 22pt drawn box. */
function CheckBox({ checked, label, onPress }: { checked: boolean; label: string; onPress: () => void }) {
  const { theme: t } = useTheme()
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      aria-checked={checked}
      style={(state) => {
        const { focused } = state as WebPressableState
        return [
          { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.sm },
          focusRing(t.focusRing, focused),
        ]
      }}
    >
      <View
        {...decorative}
        style={{
          width: 22, height: 22, borderRadius: 6, borderWidth: 1.5,
          borderColor: checked ? t.textSecondary : t.inputBorder,
          backgroundColor: checked ? t.textSecondary : 'transparent',
          alignItems: 'center', justifyContent: 'center',
        }}
      >
        {checked ? <Lineicons icon={CheckOutlined} size={14} color={t.surface} /> : null}
      </View>
    </Pressable>
  )
}

// ── Main component ───────────────────────────────────────────────────────────

export default function NoteEditorScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const { theme: t } = useTheme()
  const insets = useSafeInsets()
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
  const [missing, setMissing] = useState(false)
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const reminderOpts = useMemo(() => getReminderOptions(), [])

  // Load note on mount
  useEffect(() => {
    if (!id) return
    let cancelled = false
    void db.select().from(notesTable).where(eq(notesTable.id, id)).limit(1).then(rows => {
      if (cancelled) return
      const row = rows[0]
      if (!row) { setMissing(true); return }
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
    await save(title, content, checkItems, color)
    await db.update(notesTable).set({ isArchived: true, updatedAt: Date.now() }).where(eq(notesTable.id, id))
    goBackOr('/notes')
  }, [id, db, save, title, content, checkItems, color])

  const handleDelete = useCallback(() => {
    confirmAction(
      'Move to trash',
      'Move this note to trash? Trash is emptied after 7 days.',
      'Move to trash',
      async () => {
        if (!id) return
        if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
        await save(title, content, checkItems, color)
        await db.update(notesTable).set({ isTrashed: true, trashedAt: Date.now(), updatedAt: Date.now() }).where(eq(notesTable.id, id))
        goBackOr('/notes')
      },
      { destructive: true },
    )
  }, [id, db, save, title, content, checkItems, color])

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
    if (!id) return
    if (assignedIds.includes(labelId)) {
      await unassignLabel(id, labelId)
      setAssignedIds(prev => prev.filter(l => l !== labelId))
    } else {
      await assignLabel(id, labelId)
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

  const hasActiveReminder = reminderAt != null && reminderAt > Date.now()
  const unchecked = checkItems.filter(ci => !ci.isChecked)
  const checked = checkItems.filter(ci => ci.isChecked)
  const tone = noteTone(color)
  const webInput = Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null

  const header = <DetailTopBar bare fallbackHref="/notes" />

  if (missing) {
    return (
      <Screen header={header}>
        <Stack.Screen options={{ headerShown: false }} />
        <EmptyState
          icon={<Lineicons icon={FileQuestionOutlined} size={26} color={t.textSecondary} />}
          title="This note is gone"
          body="It may have been deleted forever from the trash."
          actionLabel="Back to notes"
          onAction={() => router.replace('/notes' as never)}
        />
      </Screen>
    )
  }

  if (!loaded) {
    return (
      <Screen header={header}>
        <Stack.Screen options={{ headerShown: false }} />
        <View accessible accessibilityLabel="Loading note" aria-busy style={{ gap: spacing.md, paddingTop: spacing.sm }}>
          <Skeleton width="60%" height={32} />
          <Skeleton height={240} radius={radius.xl} />
        </View>
      </Screen>
    )
  }

  const checklistRow = (item: ChecklistItem) => (
    <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginLeft: -spacing.md }}>
      <CheckBox checked={item.isChecked} label={item.text || 'List item'} onPress={() => toggleCheck(item.id)} />
      {item.isChecked ? (
        <Text
          style={[textStyle('body', t.textSecondary), { flex: 1, textDecorationLine: 'line-through' }]}
          maxFontSizeMultiplier={2}
        >
          {item.text}
        </Text>
      ) : (
        <TextInput
          style={[textStyle('body', t.textPrimary), { flex: 1, minHeight: 44 }, webInput]}
          value={item.text}
          onChangeText={t2 => updateCheckText(item.id, t2)}
          accessibilityLabel={item.text ? `Edit ${item.text}` : 'New list item'}
          placeholder="List item"
          placeholderTextColor={t.textTertiary}
          onSubmitEditing={addCheckItem}
          submitBehavior="submit"
          maxFontSizeMultiplier={2}
        />
      )}
      <ToolButton label={`Remove ${item.text || 'list item'}`} onPress={() => removeCheckItem(item.id)}>
        <Lineicons icon={XmarkOutlined} size={16} color={t.textSecondary} />
      </ToolButton>
    </View>
  )

  return (
    <Screen
      header={header}
      scroll={false}
      contentContainerStyle={{ paddingBottom: insets.bottom + spacing.lg }}
    >
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View
          style={{
            flex: 1,
            backgroundColor: noteSurface(t, color),
            borderRadius: radius.xl,
            borderCurve: 'continuous',
            borderWidth: 1,
            borderColor: t.border,
            overflow: 'hidden',
          }}
        >
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: spacing.xl, gap: spacing.md }}
            keyboardShouldPersistTaps="handled"
          >
            <TextInput
              style={[textStyle('title', t.textPrimary), webInput]}
              accessibilityLabel="Note title"
              placeholder="Title"
              placeholderTextColor={t.textTertiary}
              value={title}
              onChangeText={setTitle}
              returnKeyType="next"
              maxFontSizeMultiplier={1.6}
            />

            {hasActiveReminder ? (
              <Pressable
                onPress={() => setShowReminderPicker(true)}
                accessibilityRole="button"
                accessibilityLabel={`Reminder set for ${formatReminderFull(reminderAt!)}. Change it.`}
                style={(state) => {
                  const { focused } = state as WebPressableState
                  return [
                    {
                      alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: spacing.xs,
                      minHeight: 44, paddingHorizontal: spacing.md, borderRadius: radius.pill,
                      backgroundColor: t.accentSurface, borderWidth: 1, borderColor: t.accentBorder,
                    },
                    focusRing(t.focusRing, focused),
                  ]
                }}
              >
                <View {...decorative}><Lineicons icon={Bell1Solid} size={14} color={t.accentText} /></View>
                <Text style={textStyle('label', t.accentText)} maxFontSizeMultiplier={2}>{formatReminderFull(reminderAt!)}</Text>
              </Pressable>
            ) : null}

            {type === 'text' ? (
              <TextInput
                style={[textStyle('body', t.textPrimary), { minHeight: 240 }, webInput]}
                accessibilityLabel="Note text"
                placeholder="Start writing"
                placeholderTextColor={t.textTertiary}
                value={content}
                onChangeText={setContent}
                multiline
                textAlignVertical="top"
                maxFontSizeMultiplier={2}
              />
            ) : (
              <View>
                {unchecked.map(checklistRow)}
                <View style={{ alignSelf: 'flex-start', marginLeft: -spacing.md }}>
                  <Button
                    variant="ghost"
                    size="sm"
                    label="Add item"
                    onPress={addCheckItem}
                    icon={<Lineicons icon={PlusOutlined} size={16} color={t.accentText} />}
                  />
                </View>
                {checked.length > 0 ? (
                  <>
                    <Text style={[textStyle('label', t.textSecondary), { marginTop: spacing.md }]} maxFontSizeMultiplier={2}>
                      {`${checked.length} checked`}
                    </Text>
                    {checked.map(checklistRow)}
                  </>
                ) : null}
              </View>
            )}
          </ScrollView>

          {/* Toolbar: colour radios, then the note's actions — inside the column. */}
          <View
            style={{
              flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between',
              columnGap: spacing.md, rowGap: spacing.xs,
              borderTopWidth: 1, borderTopColor: t.border,
              paddingHorizontal: spacing.sm, paddingVertical: spacing.xs,
            }}
          >
            <View
              accessibilityRole="radiogroup"
              accessibilityLabel="Note colour"
              style={{ flexDirection: 'row', flexWrap: 'wrap' }}
            >
              {NOTE_SWATCHES.map(sw => {
                const on = sw.tone === tone
                return (
                  <Pressable
                    key={sw.tone}
                    onPress={() => setColor(sw.key)}
                    accessibilityRole="radio"
                    accessibilityLabel={sw.name}
                    aria-checked={on}
                    style={(state) => {
                      const { focused } = state as WebPressableState
                      return [
                        { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radius.pill },
                        focusRing(t.focusRing, focused),
                      ]
                    }}
                  >
                    <View
                      {...decorative}
                      style={{
                        width: 30, height: 30, borderRadius: radius.pill,
                        borderWidth: on ? 2 : 1,
                        borderColor: on ? t.accent : noteSwatchBorder(t, sw.key),
                        backgroundColor: t.bg,
                        overflow: 'hidden',
                      }}
                    >
                      <View style={{ flex: 1, backgroundColor: noteSurface(t, sw.key), alignItems: 'center', justifyContent: 'center' }}>
                        {on ? <Lineicons icon={CheckOutlined} size={14} color={t.textPrimary} /> : null}
                      </View>
                    </View>
                  </Pressable>
                )
              })}
            </View>
            <View style={{ flexDirection: 'row' }}>
              <ToolButton
                label={hasActiveReminder ? 'Reminder, set' : 'Reminder'}
                active={hasActiveReminder}
                onPress={() => setShowReminderPicker(true)}
              >
                <Lineicons icon={hasActiveReminder ? Bell1Solid : Bell1Outlined} size={20} color={hasActiveReminder ? t.accentText : t.textPrimary} />
              </ToolButton>
              <ToolButton
                label={assignedIds.length > 0 ? `Labels, ${assignedIds.length} assigned` : 'Labels'}
                active={assignedIds.length > 0}
                onPress={() => setShowLabelPicker(true)}
              >
                <Lineicons icon={Bookmark1Outlined} size={20} color={assignedIds.length > 0 ? t.accentText : t.textPrimary} />
              </ToolButton>
              <ToolButton label="Archive note" onPress={() => void handleArchive()}>
                <Lineicons icon={BoxArchive1Outlined} size={20} color={t.textPrimary} />
              </ToolButton>
              <ToolButton label="Move note to trash" onPress={handleDelete}>
                <Lineicons icon={Trash3Outlined} size={20} color={t.dangerStrong} />
              </ToolButton>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>

      <Sheet visible={showLabelPicker} title="Labels" onClose={() => setShowLabelPicker(false)}>
        {labels.length === 0 ? (
          <View style={{ gap: spacing.md, paddingVertical: spacing.sm }}>
            <Text style={textStyle('body', t.textSecondary)} maxFontSizeMultiplier={2}>
              No labels yet. Create them on the Labels page.
            </Text>
            <Button
              variant="secondary"
              label="Manage labels"
              onPress={() => { setShowLabelPicker(false); router.push('/notes/labels' as never) }}
            />
          </View>
        ) : labels.map(label => {
          const on = assignedIds.includes(label.id)
          return (
            <Pressable
              key={label.id}
              onPress={() => void toggleLabelAssign(label.id)}
              accessibilityRole="checkbox"
              accessibilityLabel={label.name}
              aria-checked={on}
              style={(state) => {
                const { pressed, focused } = state as WebPressableState
                return [
                  {
                    flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 52,
                    borderBottomWidth: 1, borderBottomColor: t.divider,
                    backgroundColor: pressed ? t.surface2 : 'transparent',
                  },
                  focusRing(t.focusRing, focused),
                ]
              }}
            >
              <Text style={[textStyle('body', t.textPrimary), { flex: 1 }]} maxFontSizeMultiplier={2}>{label.name}</Text>
              <View
                {...decorative}
                style={{
                  width: 24, height: 24, borderRadius: 6, borderWidth: 1.5,
                  borderColor: on ? t.accent : t.inputBorder,
                  backgroundColor: on ? t.accent : 'transparent',
                  alignItems: 'center', justifyContent: 'center',
                }}
              >
                {on ? <Lineicons icon={CheckOutlined} size={14} color={t.textInverse} /> : null}
              </View>
            </Pressable>
          )
        })}
      </Sheet>

      <Sheet visible={showReminderPicker} title="Set a reminder" onClose={() => setShowReminderPicker(false)}>
        {reminderOpts.map(opt => {
          const current = reminderAt != null && opt.ms === reminderAt
          return (
            <Pressable
              key={opt.label}
              onPress={() => void handleSetReminder(opt.ms)}
              accessibilityRole="button"
              accessibilityLabel={`${opt.label}, ${opt.sub}`}
              style={(state) => {
                const { pressed, focused } = state as WebPressableState
                return [
                  {
                    flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 60,
                    borderBottomWidth: 1, borderBottomColor: t.divider,
                    backgroundColor: pressed ? t.surface2 : 'transparent',
                  },
                  focusRing(t.focusRing, focused),
                ]
              }}
            >
              <View {...decorative}><Lineicons icon={Alarm1Outlined} size={20} color={t.accentText} /></View>
              <View style={{ flex: 1 }}>
                <Text style={textStyle('titleSm', t.textPrimary)} maxFontSizeMultiplier={2}>{opt.label}</Text>
                <Text style={textStyle('bodySm', t.textSecondary)} maxFontSizeMultiplier={2}>{opt.sub}</Text>
              </View>
              {current ? <View {...decorative}><Lineicons icon={CheckOutlined} size={16} color={t.accentText} /></View> : null}
            </Pressable>
          )
        })}
        {hasActiveReminder ? (
          <View style={{ marginTop: spacing.md }}>
            <Button variant="danger" label="Remove reminder" fullWidth onPress={() => void handleSetReminder(null)} />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  )
}
