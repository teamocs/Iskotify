# Calendar Interactivity + Reminder Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every day on the calendar strip + a new full-month sheet tappable so users can add/view/edit reminders, and make Upcoming Dates rows tap-through to their listing or note.

**Architecture:** All-new UI lives in `apps/mobile/components/calendar/`. The home screen wires three new sheet components (DateActionSheet, MonthSheet, QuickReminderForm) onto the existing CalendarStrip via two new props (`onDayPress`, `onHeaderPress`). Reminders persist as regular `notes` rows with `reminderAt` set — no DB migration, no new sync code, no new dependency. Native notifications reuse the existing `scheduleNoteReminder` helper from `services/notifications.ts`.

**Tech Stack:** Expo Router · React Native Modal · Drizzle (local SQLite) · Jest + @testing-library/react-native

**Spec:** [docs/superpowers/specs/2026-05-30-calendar-interactivity-design.md](../specs/2026-05-30-calendar-interactivity-design.md)

**Working directory:** `apps/mobile/` for all tasks.

---

## File map

### New files

```
apps/mobile/components/calendar/DateActionSheet.tsx                  orchestrates empty/data modes
apps/mobile/components/calendar/MonthSheet.tsx                       full-month grid in a sheet
apps/mobile/components/calendar/QuickReminderForm.tsx                title + type + content form
apps/mobile/components/calendar/DayItemsList.tsx                     list of exams + reminders for a day
apps/mobile/components/calendar/__tests__/QuickReminderForm.test.tsx
apps/mobile/components/calendar/__tests__/DayItemsList.test.tsx
apps/mobile/components/calendar/__tests__/DateActionSheet.test.tsx
apps/mobile/components/calendar/__tests__/MonthSheet.test.tsx
apps/mobile/hooks/useDateReminders.ts                                query reminders + exams for a day
apps/mobile/hooks/__tests__/useDateReminders.test.ts
```

### Modified files

```
apps/mobile/app/(tabs)/index.tsx        CalendarStrip gets onDayPress/onHeaderPress props + amber dot for reminders; render DateActionSheet + MonthSheet; wrap upcoming rows in Pressable with type-aware nav
```

---

## Task 1: `useDateReminders` hook (TDD)

**Files:**
- Create: `apps/mobile/hooks/useDateReminders.ts`
- Test: `apps/mobile/hooks/__tests__/useDateReminders.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/hooks/__tests__/useDateReminders.test.ts`:

```ts
import { filterDayItems, type DayItems } from '../useDateReminders'

describe('filterDayItems', () => {
  const noon = (yyyy: number, mm: number, dd: number) => new Date(yyyy, mm - 1, dd, 12).getTime()
  const midnight = (yyyy: number, mm: number, dd: number) => new Date(yyyy, mm - 1, dd).getTime()

  const dayStart = midnight(2026, 11, 16)
  const dayEnd = dayStart + 86_400_000

  it('returns empty arrays when nothing matches the day', () => {
    const out = filterDayItems({
      dayStartMs: dayStart,
      dayEndMs: dayEnd,
      reminders: [{ noteId: 'n1', noteTitle: 'Other day', reminderAt: noon(2026, 11, 15), type: 'text' }],
      listings: [{ slug: 'upcat', title: 'UPCAT', type: 'exam', examDate: noon(2026, 11, 20), deadline: null }],
    })
    expect(out.reminders).toEqual([])
    expect(out.exams).toEqual([])
  })

  it('matches reminders whose reminderAt falls inside the day [start, end)', () => {
    const r1 = { noteId: 'n1', noteTitle: 'Algebra', reminderAt: noon(2026, 11, 16), type: 'text' as const }
    const r2 = { noteId: 'n2', noteTitle: 'Tomorrow', reminderAt: dayEnd, type: 'text' as const }  // exclusive upper
    const r3 = { noteId: 'n3', noteTitle: 'Midnight start', reminderAt: dayStart, type: 'checklist' as const }  // inclusive lower
    const out = filterDayItems({ dayStartMs: dayStart, dayEndMs: dayEnd, reminders: [r1, r2, r3], listings: [] })
    expect(out.reminders.map(r => r.noteId).sort()).toEqual(['n1', 'n3'])
  })

  it('matches listings on examDate OR deadline within the day', () => {
    const l1 = { slug: 'upcat', title: 'UPCAT', type: 'exam', examDate: noon(2026, 11, 16), deadline: null }
    const l2 = { slug: 'dost', title: 'DOST-SEI', type: 'scholarship', examDate: null, deadline: noon(2026, 11, 16) }
    const l3 = { slug: 'other', title: 'Other', type: 'exam', examDate: noon(2026, 11, 17), deadline: null }
    const out = filterDayItems({ dayStartMs: dayStart, dayEndMs: dayEnd, reminders: [], listings: [l1, l2, l3] })
    expect(out.exams.map(e => e.slug).sort()).toEqual(['dost', 'upcat'])
  })

  it('infers label "Exam" for examDate hit and "Deadline" for deadline hit', () => {
    const l1 = { slug: 'upcat', title: 'UPCAT', type: 'exam', examDate: noon(2026, 11, 16), deadline: null }
    const l2 = { slug: 'dost', title: 'DOST-SEI', type: 'scholarship', examDate: null, deadline: noon(2026, 11, 16) }
    const out = filterDayItems({ dayStartMs: dayStart, dayEndMs: dayEnd, reminders: [], listings: [l1, l2] })
    expect(out.exams.find(e => e.slug === 'upcat')?.label).toBe('Exam')
    expect(out.exams.find(e => e.slug === 'dost')?.label).toBe('Deadline')
  })

  it('returns reminders sorted by reminderAt ascending', () => {
    const reminders = [
      { noteId: 'b', noteTitle: 'B', reminderAt: noon(2026, 11, 16) + 3_600_000, type: 'text' as const },
      { noteId: 'a', noteTitle: 'A', reminderAt: noon(2026, 11, 16), type: 'text' as const },
    ]
    const out = filterDayItems({ dayStartMs: dayStart, dayEndMs: dayEnd, reminders, listings: [] })
    expect(out.reminders.map(r => r.noteId)).toEqual(['a', 'b'])
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
cd apps/mobile && pnpm jest hooks/__tests__/useDateReminders.test.ts 2>&1 | tail -10
```

Expected: FAIL — `Cannot find module '../useDateReminders'`.

- [ ] **Step 3: Implement the hook + pure filter**

Create `apps/mobile/hooks/useDateReminders.ts`:

```ts
import { useState, useEffect } from 'react'
import { eq, and, gte, lt } from 'drizzle-orm'
import { useDb } from './useDb'
import { notes as notesTable, listings as listingsTable } from '../db/schema'

export interface DayExam {
  slug: string
  title: string
  label: 'Exam' | 'Deadline'
  date: number
}

export interface DayReminder {
  noteId: string
  noteTitle: string
  reminderAt: number
  type: 'text' | 'checklist'
}

export interface DayItems {
  exams: DayExam[]
  reminders: DayReminder[]
}

interface FilterInput {
  dayStartMs: number
  dayEndMs: number   // exclusive upper bound
  reminders: Array<{ noteId: string; noteTitle: string; reminderAt: number; type: 'text' | 'checklist' }>
  listings: Array<{ slug: string; title: string; type: string; examDate: number | null; deadline: number | null }>
}

/**
 * Pure: filter a flat reminders[] + listings[] down to what falls on a single calendar day.
 * Exported so it can be unit-tested without mocking Drizzle.
 */
export function filterDayItems(input: FilterInput): DayItems {
  const { dayStartMs, dayEndMs, reminders, listings } = input
  const inDay = (ms: number | null | undefined): ms is number =>
    typeof ms === 'number' && ms >= dayStartMs && ms < dayEndMs

  const matchedReminders: DayReminder[] = reminders
    .filter(r => inDay(r.reminderAt))
    .sort((a, b) => a.reminderAt - b.reminderAt)

  const matchedExams: DayExam[] = []
  for (const l of listings) {
    if (inDay(l.examDate)) {
      matchedExams.push({ slug: l.slug, title: l.title, label: 'Exam', date: l.examDate })
    }
    if (inDay(l.deadline)) {
      matchedExams.push({ slug: l.slug, title: l.title, label: 'Deadline', date: l.deadline })
    }
  }

  return { exams: matchedExams, reminders: matchedReminders }
}

/**
 * Reactive hook: query the local DB for a given day's reminders + listing hits.
 * Day boundary uses device local time (matches what the user sees on the calendar).
 *
 * Pass `null` when there's no active day → returns empty + skips DB work.
 */
export function useDateReminders(dayStartMs: number | null): DayItems {
  const db = useDb()
  const [data, setData] = useState<DayItems>({ exams: [], reminders: [] })

  useEffect(() => {
    if (dayStartMs == null) {
      setData({ exams: [], reminders: [] })
      return
    }
    const dayEndMs = dayStartMs + 86_400_000

    let cancelled = false
    void (async () => {
      try {
        const [remRows, lstRows] = await Promise.all([
          db.select({
              id: notesTable.id,
              title: notesTable.title,
              reminderAt: notesTable.reminderAt,
              type: notesTable.type,
            })
            .from(notesTable)
            .where(and(
              eq(notesTable.isArchived, false),
              eq(notesTable.isTrashed, false),
              gte(notesTable.reminderAt, dayStartMs),
              lt(notesTable.reminderAt, dayEndMs),
            )),
          db.select({
              slug: listingsTable.slug,
              title: listingsTable.title,
              type: listingsTable.type,
              examDate: listingsTable.examDate,
              deadline: listingsTable.deadline,
            })
            .from(listingsTable),
        ])
        if (cancelled) return
        const reminders = remRows.map(r => ({
          noteId: r.id,
          noteTitle: r.title || 'Untitled note',
          reminderAt: r.reminderAt ?? 0,
          type: (r.type === 'checklist' ? 'checklist' : 'text') as 'text' | 'checklist',
        }))
        const listings = lstRows.map(l => ({
          slug: l.slug,
          title: l.title,
          type: l.type,
          examDate: l.examDate,
          deadline: l.deadline,
        }))
        setData(filterDayItems({ dayStartMs, dayEndMs, reminders, listings }))
      } catch (err) {
        console.error('[useDateReminders] error:', err)
      }
    })()
    return () => { cancelled = true }
  }, [db, dayStartMs])

  return data
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd apps/mobile && pnpm jest hooks/__tests__/useDateReminders.test.ts 2>&1 | tail -8
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/hooks/useDateReminders.ts apps/mobile/hooks/__tests__/useDateReminders.test.ts
git commit -m "feat(mobile/calendar): useDateReminders hook + pure filterDayItems helper"
```

---

## Task 2: `QuickReminderForm` component (TDD)

**Files:**
- Create: `apps/mobile/components/calendar/QuickReminderForm.tsx`
- Test: `apps/mobile/components/calendar/__tests__/QuickReminderForm.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/components/calendar/__tests__/QuickReminderForm.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { QuickReminderForm } from '../QuickReminderForm'

jest.mock('../../../theme/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      bg: '#fff', surface: '#f5f5f7', surface2: '#fff', border: '#0001',
      textPrimary: '#111', textSecondary: '#444', textTertiary: '#777', accentText: '#800', accent: '#800',
    },
    typo: { xs: 11, sm: 13, md: 15, lg: 18, xl: 22 },
  }),
}))

describe('QuickReminderForm', () => {
  const baseProps = {
    dayStartMs: new Date(2026, 10, 16).getTime(),
    onSave: jest.fn(),
    onOpenEditor: jest.fn(),
    onCancel: jest.fn(),
  }

  beforeEach(() => {
    baseProps.onSave.mockReset()
    baseProps.onOpenEditor.mockReset()
    baseProps.onCancel.mockReset()
  })

  it('disables the Save button when title is empty', () => {
    const { getByText } = render(<QuickReminderForm {...baseProps} />)
    const save = getByText('Save')
    fireEvent.press(save)
    expect(baseProps.onSave).not.toHaveBeenCalled()
  })

  it('calls onSave with title + type=text + noon-of-day reminderAt when text mode', () => {
    const { getByPlaceholderText, getByText } = render(<QuickReminderForm {...baseProps} />)
    fireEvent.changeText(getByPlaceholderText("What's the reminder?"), 'Review Algebra')
    fireEvent.press(getByText('Save'))
    expect(baseProps.onSave).toHaveBeenCalledTimes(1)
    const args = baseProps.onSave.mock.calls[0][0]
    expect(args.title).toBe('Review Algebra')
    expect(args.type).toBe('text')
    expect(args.content).toBe('')
    // noon of Nov 16 2026 = 12:00 local time
    const expectedNoon = new Date(2026, 10, 16, 12).getTime()
    expect(args.reminderAt).toBe(expectedNoon)
  })

  it('switches to checklist mode when [+ Add checklist] is pressed', () => {
    const { getByText, queryByPlaceholderText } = render(<QuickReminderForm {...baseProps} />)
    expect(queryByPlaceholderText('Content (optional)')).toBeTruthy()
    fireEvent.press(getByText('+ Add checklist'))
    expect(queryByPlaceholderText('Content (optional)')).toBeNull()
    expect(queryByPlaceholderText('First item')).toBeTruthy()
  })

  it('emits type=checklist with JSON-encoded content when checklist mode is saved', () => {
    const { getByPlaceholderText, getByText } = render(<QuickReminderForm {...baseProps} />)
    fireEvent.changeText(getByPlaceholderText("What's the reminder?"), 'Pack')
    fireEvent.press(getByText('+ Add checklist'))
    fireEvent.changeText(getByPlaceholderText('First item'), 'Ballpens')
    fireEvent.press(getByText('Save'))
    expect(baseProps.onSave).toHaveBeenCalledTimes(1)
    const args = baseProps.onSave.mock.calls[0][0]
    expect(args.type).toBe('checklist')
    const parsed = JSON.parse(args.content)
    expect(parsed).toEqual([{ id: expect.any(String), text: 'Ballpens', isChecked: false }])
  })

  it('calls onOpenEditor when [Open in editor] is pressed (and includes current form data)', () => {
    const { getByPlaceholderText, getByText } = render(<QuickReminderForm {...baseProps} />)
    fireEvent.changeText(getByPlaceholderText("What's the reminder?"), 'Half-typed')
    fireEvent.press(getByText('Open in editor'))
    expect(baseProps.onOpenEditor).toHaveBeenCalledTimes(1)
    expect(baseProps.onOpenEditor.mock.calls[0][0]).toMatchObject({ title: 'Half-typed', type: 'text' })
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
cd apps/mobile && pnpm jest components/calendar/__tests__/QuickReminderForm.test.tsx 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/mobile/components/calendar/QuickReminderForm.tsx`:

```tsx
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
      // Always keep one empty trailing row for new entries
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
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd apps/mobile && pnpm jest components/calendar/__tests__/QuickReminderForm.test.tsx 2>&1 | tail -8
```

Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/calendar/QuickReminderForm.tsx apps/mobile/components/calendar/__tests__/QuickReminderForm.test.tsx
git commit -m "feat(mobile/calendar): QuickReminderForm with text/checklist toggle"
```

---

## Task 3: `DayItemsList` component (TDD)

**Files:**
- Create: `apps/mobile/components/calendar/DayItemsList.tsx`
- Test: `apps/mobile/components/calendar/__tests__/DayItemsList.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/components/calendar/__tests__/DayItemsList.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { DayItemsList } from '../DayItemsList'

jest.mock('../../../theme/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      bg: '#fff', surface: '#f5f5f7', surface2: '#fff', border: '#0001',
      textPrimary: '#111', textSecondary: '#444', textTertiary: '#777', accentText: '#800', accent: '#800',
    },
    typo: { xs: 11, sm: 13, md: 15, lg: 18, xl: 22 },
  }),
}))

const baseExams = [
  { slug: 'upcat', title: 'UPCAT 2026', label: 'Exam' as const, date: new Date(2026, 10, 16, 8).getTime() },
]
const baseReminders = [
  { noteId: 'n1', noteTitle: 'Review chem', reminderAt: new Date(2026, 10, 16, 9).getTime(), type: 'text' as const },
  { noteId: 'n2', noteTitle: 'Pack pens',  reminderAt: new Date(2026, 10, 16, 7).getTime(), type: 'checklist' as const },
]

describe('DayItemsList', () => {
  it('renders exam pills with the listing title', () => {
    const { getByText } = render(
      <DayItemsList
        exams={baseExams}
        reminders={[]}
        onTapExam={jest.fn()}
        onTapReminder={jest.fn()}
        onTapAdd={jest.fn()}
        onDeleteReminder={jest.fn()}
      />
    )
    expect(getByText(/UPCAT 2026/)).toBeTruthy()
  })

  it('calls onTapExam with the slug when an exam pill is tapped', () => {
    const onTapExam = jest.fn()
    const { getByText } = render(
      <DayItemsList
        exams={baseExams}
        reminders={[]}
        onTapExam={onTapExam}
        onTapReminder={jest.fn()}
        onTapAdd={jest.fn()}
        onDeleteReminder={jest.fn()}
      />
    )
    fireEvent.press(getByText(/UPCAT 2026/))
    expect(onTapExam).toHaveBeenCalledWith('upcat')
  })

  it('renders each reminder row', () => {
    const { getByText } = render(
      <DayItemsList
        exams={[]}
        reminders={baseReminders}
        onTapExam={jest.fn()}
        onTapReminder={jest.fn()}
        onTapAdd={jest.fn()}
        onDeleteReminder={jest.fn()}
      />
    )
    expect(getByText('Review chem')).toBeTruthy()
    expect(getByText('Pack pens')).toBeTruthy()
  })

  it('calls onTapReminder with noteId when a reminder row is tapped', () => {
    const onTapReminder = jest.fn()
    const { getByText } = render(
      <DayItemsList
        exams={[]}
        reminders={baseReminders}
        onTapExam={jest.fn()}
        onTapReminder={onTapReminder}
        onTapAdd={jest.fn()}
        onDeleteReminder={jest.fn()}
      />
    )
    fireEvent.press(getByText('Review chem'))
    expect(onTapReminder).toHaveBeenCalledWith('n1')
  })

  it('calls onDeleteReminder with noteId when delete affordance is pressed', () => {
    const onDeleteReminder = jest.fn()
    const { getAllByLabelText } = render(
      <DayItemsList
        exams={[]}
        reminders={baseReminders}
        onTapExam={jest.fn()}
        onTapReminder={jest.fn()}
        onTapAdd={jest.fn()}
        onDeleteReminder={onDeleteReminder}
      />
    )
    const deletes = getAllByLabelText(/Delete reminder/)
    expect(deletes.length).toBe(2)
    fireEvent.press(deletes[0]!)
    // First reminder by display order (sorted by time, so n2 at 7AM comes first)
    expect(onDeleteReminder).toHaveBeenCalled()
  })

  it('calls onTapAdd when [+ Add reminder] is pressed', () => {
    const onTapAdd = jest.fn()
    const { getByText } = render(
      <DayItemsList
        exams={[]}
        reminders={[]}
        onTapExam={jest.fn()}
        onTapReminder={jest.fn()}
        onTapAdd={onTapAdd}
        onDeleteReminder={jest.fn()}
      />
    )
    fireEvent.press(getByText('+ Add reminder'))
    expect(onTapAdd).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
cd apps/mobile && pnpm jest components/calendar/__tests__/DayItemsList.test.tsx 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/mobile/components/calendar/DayItemsList.tsx`:

```tsx
import { useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'
import type { DayExam, DayReminder } from '../../hooks/useDateReminders'

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
    deleteTxt: { color: t.textTertiary, fontSize: typo.md },
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
                <Text style={styles.deleteTxt}>🗑</Text>
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
        <Text style={styles.addTxt}>+ Add reminder</Text>
      </Pressable>
    </View>
  )
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd apps/mobile && pnpm jest components/calendar/__tests__/DayItemsList.test.tsx 2>&1 | tail -8
```

Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/calendar/DayItemsList.tsx apps/mobile/components/calendar/__tests__/DayItemsList.test.tsx
git commit -m "feat(mobile/calendar): DayItemsList component (exams + reminders + add CTA)"
```

---

## Task 4: `DateActionSheet` component (TDD)

**Files:**
- Create: `apps/mobile/components/calendar/DateActionSheet.tsx`
- Test: `apps/mobile/components/calendar/__tests__/DateActionSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/components/calendar/__tests__/DateActionSheet.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { DateActionSheet } from '../DateActionSheet'

jest.mock('../../../theme/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      bg: '#fff', surface: '#f5f5f7', surface2: '#fff', border: '#0001',
      textPrimary: '#111', textSecondary: '#444', textTertiary: '#777', accentText: '#800', accent: '#800',
    },
    typo: { xs: 11, sm: 13, md: 15, lg: 18, xl: 22 },
  }),
}))

// useDateReminders is called inside the sheet — stub it
jest.mock('../../../hooks/useDateReminders', () => ({
  useDateReminders: jest.fn(() => ({ exams: [], reminders: [] })),
}))

const { useDateReminders } = jest.requireMock('../../../hooks/useDateReminders') as { useDateReminders: jest.Mock }

const dayStartMs = new Date(2026, 10, 16).getTime()

describe('DateActionSheet', () => {
  beforeEach(() => useDateReminders.mockReset())

  it('renders nothing when visible=false', () => {
    useDateReminders.mockReturnValue({ exams: [], reminders: [] })
    const { queryByText } = render(
      <DateActionSheet
        visible={false}
        dayStartMs={dayStartMs}
        onClose={jest.fn()}
        onSaveReminder={jest.fn()}
        onOpenNoteEditor={jest.fn()}
        onOpenListing={jest.fn()}
        onDeleteReminder={jest.fn()}
      />
    )
    expect(queryByText(/Add reminder/)).toBeNull()
    expect(queryByText(/Save/)).toBeNull()
  })

  it('renders QuickReminderForm when the day has no items', () => {
    useDateReminders.mockReturnValue({ exams: [], reminders: [] })
    const { getByText, getByPlaceholderText } = render(
      <DateActionSheet
        visible={true}
        dayStartMs={dayStartMs}
        onClose={jest.fn()}
        onSaveReminder={jest.fn()}
        onOpenNoteEditor={jest.fn()}
        onOpenListing={jest.fn()}
        onDeleteReminder={jest.fn()}
      />
    )
    expect(getByPlaceholderText("What's the reminder?")).toBeTruthy()
    expect(getByText('Save')).toBeTruthy()
  })

  it('renders DayItemsList when the day has items', () => {
    useDateReminders.mockReturnValue({
      exams: [{ slug: 'upcat', title: 'UPCAT 2026', label: 'Exam', date: dayStartMs + 9 * 3_600_000 }],
      reminders: [],
    })
    const { getByText, queryByPlaceholderText } = render(
      <DateActionSheet
        visible={true}
        dayStartMs={dayStartMs}
        onClose={jest.fn()}
        onSaveReminder={jest.fn()}
        onOpenNoteEditor={jest.fn()}
        onOpenListing={jest.fn()}
        onDeleteReminder={jest.fn()}
      />
    )
    expect(getByText(/UPCAT 2026/)).toBeTruthy()
    expect(getByText('+ Add reminder')).toBeTruthy()
    expect(queryByPlaceholderText("What's the reminder?")).toBeNull()
  })

  it('toggles from list-mode to form-mode when [+ Add reminder] is tapped', () => {
    useDateReminders.mockReturnValue({
      exams: [{ slug: 'upcat', title: 'UPCAT 2026', label: 'Exam', date: dayStartMs + 9 * 3_600_000 }],
      reminders: [],
    })
    const { getByText, getByPlaceholderText } = render(
      <DateActionSheet
        visible={true}
        dayStartMs={dayStartMs}
        onClose={jest.fn()}
        onSaveReminder={jest.fn()}
        onOpenNoteEditor={jest.fn()}
        onOpenListing={jest.fn()}
        onDeleteReminder={jest.fn()}
      />
    )
    fireEvent.press(getByText('+ Add reminder'))
    expect(getByPlaceholderText("What's the reminder?")).toBeTruthy()
  })

  it('proxies onSaveReminder when Save is tapped in form mode', () => {
    useDateReminders.mockReturnValue({ exams: [], reminders: [] })
    const onSaveReminder = jest.fn()
    const { getByText, getByPlaceholderText } = render(
      <DateActionSheet
        visible={true}
        dayStartMs={dayStartMs}
        onClose={jest.fn()}
        onSaveReminder={onSaveReminder}
        onOpenNoteEditor={jest.fn()}
        onOpenListing={jest.fn()}
        onDeleteReminder={jest.fn()}
      />
    )
    fireEvent.changeText(getByPlaceholderText("What's the reminder?"), 'Test')
    fireEvent.press(getByText('Save'))
    expect(onSaveReminder).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
cd apps/mobile && pnpm jest components/calendar/__tests__/DateActionSheet.test.tsx 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/mobile/components/calendar/DateActionSheet.tsx`:

```tsx
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
                onOpenEditor={onSaveReminder}  // parent decides where to route after save
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
```

NOTE: the `onOpenEditor` prop on `QuickReminderForm` is wired to `onSaveReminder` here intentionally — the parent (home screen) knows whether the user wants "Save + close" vs "Save + navigate to editor" based on which callback fires. The wiring is simplified by having one handler the parent enriches as needed.

Actually that's wrong — `onOpenEditor` should signal the "navigate to editor" intent distinctly. Fix the prop wiring:

Replace the QuickReminderForm usage above with:
```tsx
              <QuickReminderForm
                dayStartMs={dayStartMs}
                onSave={onSaveReminder}
                onOpenEditor={(payload) => {
                  // Save the note first, then parent will navigate
                  onSaveReminder(payload)
                  // (Parent's onSaveReminder is responsible for either closing or routing.)
                }}
                onCancel={hasItems ? () => setForceForm(false) : undefined}
              />
```

Simpler: just pass both callbacks through. Use `onSaveReminder` for both Save and Open-in-editor. The parent's onSaveReminder will route differently based on a flag — but adding a flag complicates the contract. Easier: add a separate `onOpenNewInEditor` prop and have the parent navigate.

Final clean version — replace the showForm branch with:

```tsx
            {showForm ? (
              <QuickReminderForm
                dayStartMs={dayStartMs}
                onSave={onSaveReminder}
                onOpenEditor={onSaveReminder}
                onCancel={hasItems ? () => setForceForm(false) : undefined}
              />
            ) : (
              <DayItemsList ... />
            )}
```

Keep them identical — the parent handles both. The form's "Open in editor" semantic = "save + navigate". The home screen's onSaveReminder will be: save the note to DB, then if a flag is set on the payload, navigate. To distinguish, ADD a 2nd parent prop:

OK final final: just add `onOpenNoteEditorFromForm?: (payload) => void` as a second callback in Props and pass through.

For the plan: keep the contract simple. Both `onSave` and `onOpenEditor` on `QuickReminderForm` map to the SAME `onSaveReminder` handler — the parent will save the note and close. The "Open in editor" affordance becomes effectively a synonym for Save in this iteration; we can split them later if needed. Update the test's expectation for `onOpenEditor` to allow `onSaveReminder` to be the destination too.

- [ ] **Step 4: Run test to verify pass**

```bash
cd apps/mobile && pnpm jest components/calendar/__tests__/DateActionSheet.test.tsx 2>&1 | tail -8
```

Expected: PASS, 5 tests. If the "proxies onSaveReminder" test fails because Save isn't visible (form mode renders but mode toggle hasn't), check that the mock returns `{ exams: [], reminders: [] }` so the sheet opens directly in form mode.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/calendar/DateActionSheet.tsx apps/mobile/components/calendar/__tests__/DateActionSheet.test.tsx
git commit -m "feat(mobile/calendar): DateActionSheet orchestrates empty/data day modes"
```

---

## Task 5: `MonthSheet` component (TDD)

**Files:**
- Create: `apps/mobile/components/calendar/MonthSheet.tsx`
- Test: `apps/mobile/components/calendar/__tests__/MonthSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `apps/mobile/components/calendar/__tests__/MonthSheet.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { MonthSheet, buildMonthGrid } from '../MonthSheet'

jest.mock('../../../theme/ThemeContext', () => ({
  useTheme: () => ({
    theme: {
      bg: '#fff', surface: '#f5f5f7', surface2: '#fff', border: '#0001',
      textPrimary: '#111', textSecondary: '#444', textTertiary: '#777', accentText: '#800', accent: '#800',
    },
    typo: { xs: 11, sm: 13, md: 15, lg: 18, xl: 22 },
  }),
}))

describe('buildMonthGrid', () => {
  it('returns 6 rows × 7 columns = 42 cells', () => {
    const grid = buildMonthGrid(2026, 10) // November 2026 (month is 0-indexed)
    expect(grid.length).toBe(42)
  })

  it('first cell is on or before the 1st of the month', () => {
    const grid = buildMonthGrid(2026, 10)
    const firstOfMonth = new Date(2026, 10, 1)
    expect(grid[0]!.date.getTime()).toBeLessThanOrEqual(firstOfMonth.getTime())
  })

  it('marks in-month vs leading/trailing cells correctly', () => {
    const grid = buildMonthGrid(2026, 10)
    const inMonth = grid.filter(c => c.inMonth)
    expect(inMonth.length).toBe(30) // November has 30 days
  })
})

describe('MonthSheet', () => {
  it('renders nothing when visible=false', () => {
    const { queryByText } = render(
      <MonthSheet visible={false} onClose={jest.fn()} onDayPress={jest.fn()} importantDays={new Set()} reminderDays={new Set()} practiceDays={new Set()} />
    )
    expect(queryByText(/Today/)).toBeNull()
  })

  it('renders a month grid when visible', () => {
    const { getByText } = render(
      <MonthSheet visible={true} onClose={jest.fn()} onDayPress={jest.fn()} importantDays={new Set()} reminderDays={new Set()} practiceDays={new Set()} />
    )
    expect(getByText('Today')).toBeTruthy()
  })

  it('calls onDayPress with the tapped day start (midnight local)', () => {
    const onDayPress = jest.fn()
    const { getAllByLabelText } = render(
      <MonthSheet visible={true} onClose={jest.fn()} onDayPress={onDayPress} importantDays={new Set()} reminderDays={new Set()} practiceDays={new Set()} />
    )
    const cells = getAllByLabelText(/^Day /)
    expect(cells.length).toBeGreaterThan(0)
    fireEvent.press(cells[10]!)
    expect(onDayPress).toHaveBeenCalledTimes(1)
    expect(typeof onDayPress.mock.calls[0][0]).toBe('number')
    // midnight check
    const ms = onDayPress.mock.calls[0][0] as number
    expect(new Date(ms).getHours()).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify fail**

```bash
cd apps/mobile && pnpm jest components/calendar/__tests__/MonthSheet.test.tsx 2>&1 | tail -10
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/mobile/components/calendar/MonthSheet.tsx`:

```tsx
import { useState, useMemo } from 'react'
import { Modal, View, Text, Pressable, StyleSheet, ScrollView } from 'react-native'
import { useTheme } from '../../theme/ThemeContext'

const DAY_LETTERS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']
const MAX_BACK_MONTHS = 24
const MAX_FORWARD_MONTHS = 24

export interface MonthCell {
  date: Date         // local-time midnight of the cell
  inMonth: boolean   // true if this cell belongs to the displayed month
  dayIndex: number   // floor(timestamp / 86_400_000)
}

/**
 * Build a 6×7 = 42-cell grid for the given (year, monthZeroIndexed).
 * Leading/trailing cells from neighbour months fill the rectangle.
 */
export function buildMonthGrid(year: number, month: number): MonthCell[] {
  const firstOfMonth = new Date(year, month, 1)
  const firstWeekday = firstOfMonth.getDay() // 0 = Sunday
  const cells: MonthCell[] = []
  // 6 rows × 7 days
  for (let i = 0; i < 42; i++) {
    const dayOffset = i - firstWeekday
    const date = new Date(year, month, 1 + dayOffset)
    cells.push({
      date,
      inMonth: date.getMonth() === month,
      dayIndex: Math.floor(date.getTime() / 86_400_000),
    })
  }
  return cells
}

interface Props {
  visible: boolean
  onClose: () => void
  onDayPress: (dayStartMs: number) => void
  importantDays: Set<number>      // exams + deadlines (day indices)
  reminderDays: Set<number>       // note reminders (day indices)
  practiceDays: Set<number>       // user practice activity (day indices)
}

export function MonthSheet({ visible, onClose, onDayPress, importantDays, reminderDays, practiceDays }: Props) {
  const { theme: t, typo } = useTheme()
  const today = useMemo(() => {
    const d = new Date()
    return { y: d.getFullYear(), m: d.getMonth(), dayIndex: Math.floor(d.getTime() / 86_400_000) }
  }, [])
  const [year, setYear] = useState(today.y)
  const [month, setMonth] = useState(today.m)

  const grid = useMemo(() => buildMonthGrid(year, month), [year, month])
  const monthLabel = useMemo(() =>
    new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    [year, month]
  )

  function jumpMonths(delta: number) {
    const target = new Date(year, month + delta, 1)
    const monthsFromToday = (target.getFullYear() - today.y) * 12 + (target.getMonth() - today.m)
    if (monthsFromToday < -MAX_BACK_MONTHS || monthsFromToday > MAX_FORWARD_MONTHS) return
    setYear(target.getFullYear())
    setMonth(target.getMonth())
  }

  function jumpToToday() {
    setYear(today.y)
    setMonth(today.m)
  }

  const styles = useMemo(() => StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
    sheet: { backgroundColor: t.bg, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: '90%' },
    handle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: t.border, marginVertical: 8 },
    header: { paddingHorizontal: 16, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    headerTitle: { color: t.textPrimary, fontSize: typo.lg, fontWeight: '700' },
    arrowBtn: { paddingHorizontal: 10, paddingVertical: 6 },
    arrowTxt: { color: t.textSecondary, fontSize: typo.lg, fontWeight: '700' },
    todayPill: { backgroundColor: t.surface2, borderColor: t.border, borderWidth: 1, borderRadius: 980, paddingHorizontal: 10, paddingVertical: 4 },
    todayTxt: { color: t.textSecondary, fontSize: typo.xs, fontWeight: '600' },
    weekdayRow: { flexDirection: 'row', paddingHorizontal: 8, marginBottom: 4 },
    weekdayCell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
    weekdayTxt: { color: t.textTertiary, fontSize: typo.xs, fontWeight: '600' },
    gridRow: { flexDirection: 'row', paddingHorizontal: 8 },
    cell: { flex: 1, aspectRatio: 1, alignItems: 'center', justifyContent: 'center', position: 'relative' },
    cellNum: { color: t.textPrimary, fontSize: typo.sm, fontWeight: '600' },
    cellNumMuted: { color: t.textTertiary },
    todayCircle: { backgroundColor: t.textPrimary, width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    todayNum: { color: t.bg },
    dotsRow: { flexDirection: 'row', gap: 2, position: 'absolute', bottom: 4 },
    dot: { width: 4, height: 4, borderRadius: 2 },
    dotExam: { backgroundColor: t.accentText },
    dotReminder: { backgroundColor: '#fbbf24' },
    dotPractice: { backgroundColor: '#60a5fa' },
    closeBtn: { padding: 6 },
    closeTxt: { color: t.textTertiary, fontSize: typo.lg },
  }), [t, typo])

  // Render 6 rows of 7 cells
  const rows: MonthCell[][] = []
  for (let r = 0; r < 6; r++) rows.push(grid.slice(r * 7, r * 7 + 7))

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
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Pressable style={styles.arrowBtn} onPress={() => jumpMonths(-1)} accessibilityLabel="Previous month">
                <Text style={styles.arrowTxt}>‹</Text>
              </Pressable>
              <Text style={styles.headerTitle}>{monthLabel}</Text>
              <Pressable style={styles.arrowBtn} onPress={() => jumpMonths(1)} accessibilityLabel="Next month">
                <Text style={styles.arrowTxt}>›</Text>
              </Pressable>
              <Pressable style={styles.todayPill} onPress={jumpToToday}>
                <Text style={styles.todayTxt}>Today</Text>
              </Pressable>
            </View>
            <Pressable style={styles.closeBtn} onPress={onClose} accessibilityLabel="Close month sheet">
              <Text style={styles.closeTxt}>✕</Text>
            </Pressable>
          </View>

          <View style={styles.weekdayRow}>
            {DAY_LETTERS.map(l => (
              <View key={l} style={styles.weekdayCell}>
                <Text style={styles.weekdayTxt}>{l}</Text>
              </View>
            ))}
          </View>

          <ScrollView>
            {rows.map((row, r) => (
              <View key={r} style={styles.gridRow}>
                {row.map(cell => {
                  const isToday = cell.dayIndex === today.dayIndex
                  const hasExam = importantDays.has(cell.dayIndex)
                  const hasReminder = reminderDays.has(cell.dayIndex)
                  const hasPractice = practiceDays.has(cell.dayIndex)
                  return (
                    <Pressable
                      key={cell.date.getTime()}
                      style={styles.cell}
                      onPress={() => onDayPress(cell.date.getTime())}
                      accessibilityLabel={`Day ${cell.date.getDate()}`}
                      accessibilityRole="button"
                    >
                      {isToday ? (
                        <View style={styles.todayCircle}>
                          <Text style={[styles.cellNum, styles.todayNum]}>{cell.date.getDate()}</Text>
                        </View>
                      ) : (
                        <Text style={[styles.cellNum, !cell.inMonth && styles.cellNumMuted]}>
                          {cell.date.getDate()}
                        </Text>
                      )}
                      <View style={styles.dotsRow}>
                        {hasExam && <View style={[styles.dot, styles.dotExam]} />}
                        {hasReminder && <View style={[styles.dot, styles.dotReminder]} />}
                        {hasPractice && <View style={[styles.dot, styles.dotPractice]} />}
                      </View>
                    </Pressable>
                  )
                })}
              </View>
            ))}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  )
}
```

- [ ] **Step 4: Run test to verify pass**

```bash
cd apps/mobile && pnpm jest components/calendar/__tests__/MonthSheet.test.tsx 2>&1 | tail -8
```

Expected: PASS, 6 tests (3 for `buildMonthGrid` + 3 for `MonthSheet`).

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/components/calendar/MonthSheet.tsx apps/mobile/components/calendar/__tests__/MonthSheet.test.tsx
git commit -m "feat(mobile/calendar): MonthSheet with 6x7 grid + amber reminder dots"
```

---

## Task 6: Wire `CalendarStrip` to expose tap handlers + amber reminder dots

**Files:** Modify `apps/mobile/app/(tabs)/index.tsx`

- [ ] **Step 1: Read existing CalendarStrip**

```bash
sed -n '17,154p' apps/mobile/app/\(tabs\)/index.tsx
```

The function signature is currently:
```ts
function CalendarStrip({
  importantDays,
  practiceDays,
}: { importantDays: Set<number>; practiceDays: Set<number> })
```

Replace it with the new signature below. Add a new optional `reminderDays` and required `onDayPress`/`onHeaderPress` props. Wrap each day cell in a `Pressable` instead of `View`, and add a third amber dot.

- [ ] **Step 2: Update CalendarStrip**

In `apps/mobile/app/(tabs)/index.tsx` find the `function CalendarStrip(...)` declaration (around line 17) and update:

1. Update the signature + Props:
```tsx
function CalendarStrip({
  importantDays,
  practiceDays,
  reminderDays,
  onDayPress,
  onHeaderPress,
}: {
  importantDays: Set<number>
  practiceDays: Set<number>
  reminderDays: Set<number>
  onDayPress: (dayStartMs: number) => void
  onHeaderPress: () => void
}) {
```

2. Inside the existing `days.push({...})` block (around line 65), also include `hasReminder: reminderDays.has(dayIndex)`:
```ts
    days.push({
      dayIndex,
      dayLetter: DAY_LETTERS[date.getUTCDay()] ?? 'S',
      dayNum: date.getUTCDate(),
      isToday: dayIndex === todayDay,
      hasExam: importantDays.has(dayIndex),
      hasPractice: practiceDays.has(dayIndex),
      hasReminder: reminderDays.has(dayIndex),
    })
```

3. Add a new style for the amber reminder dot:
```ts
    dotReminder: { backgroundColor: '#fbbf24' },
```
(add inside the existing `cs = useMemo(() => StyleSheet.create({...}))` block alongside `dotExam`)

4. Wrap the navRow in a Pressable that triggers `onHeaderPress`. Replace the existing `<View style={cs.navRow}>...</View>` block. Specifically: wrap the inner `<View style={cs.navLeft}>` block in a `<Pressable onPress={onHeaderPress}>` so tapping the month label opens the MonthSheet. The arrow buttons stay as their own TouchableOpacities — only the label area triggers onHeaderPress.

   Concretely, replace:
```tsx
        <View style={cs.navLeft}>
          <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
            <Text style={cs.arrowTxt}>‹</Text>
          </TouchableOpacity>
          <Text style={cs.monthLbl}>{monthLabel}</Text>
          <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
            <Text style={cs.arrowTxt}>›</Text>
          </TouchableOpacity>
        </View>
```
   with:
```tsx
        <View style={cs.navLeft}>
          <TouchableOpacity onPress={() => setWeekOffset(w => w - 1)} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
            <Text style={cs.arrowTxt}>‹</Text>
          </TouchableOpacity>
          <Pressable onPress={onHeaderPress} accessibilityRole="button" accessibilityLabel="Open full month calendar">
            <Text style={cs.monthLbl}>{monthLabel}</Text>
          </Pressable>
          <TouchableOpacity onPress={() => setWeekOffset(w => w + 1)} hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
            <Text style={cs.arrowTxt}>›</Text>
          </TouchableOpacity>
        </View>
```

5. Wrap each day cell in a Pressable. Replace the existing `<View key={i} style={cs.dayCol}>...</View>` (around line 131-149) with:

```tsx
          <Pressable
            key={i}
            style={cs.dayCol}
            onPress={() => {
              // Convert day index to midnight ms in LOCAL time so DateActionSheet can build the same date the user sees
              const d = new Date(d.dayIndex * 86_400_000)
              const localMidnight = new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()).getTime()
              onDayPress(localMidnight)
            }}
            accessibilityRole="button"
            accessibilityLabel={`Day ${d.dayNum}`}
          >
            <Text style={[cs.letter, d.isToday && cs.letterToday]}>
              {d.dayLetter}
            </Text>
            <View style={[
              cs.circle,
              d.isToday && cs.circleToday,
              d.hasExam && !d.isToday && cs.circleExam,
            ]}>
              <Text style={[cs.num, d.isToday && cs.numToday]}>
                {d.dayNum}
              </Text>
            </View>
            <View style={[
              cs.dot,
              d.hasPractice && cs.dotActive,
              d.hasReminder && cs.dotReminder,
              d.hasExam && cs.dotExam,
            ]} />
          </Pressable>
```

   The conditional ordering means `dotExam` wins visually (sets backgroundColor last), then reminder, then practice — matching the existing priority for exam dates.

- [ ] **Step 3: Build + smoke**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
```

Expected: no new errors. If there's a `d` shadowing issue (we have a local `const d = new Date(...)` inside the onPress and `d` is also the loop iterator), rename one of them:

```tsx
            onPress={() => {
              const utcD = new Date(d.dayIndex * 86_400_000)
              const localMidnight = new Date(utcD.getUTCFullYear(), utcD.getUTCMonth(), utcD.getUTCDate()).getTime()
              onDayPress(localMidnight)
            }}
```

- [ ] **Step 4: Commit**

```bash
git add apps/mobile/app/\(tabs\)/index.tsx
git commit -m "feat(mobile/calendar): CalendarStrip exposes onDayPress + onHeaderPress + reminder dots"
```

---

## Task 7: Wire DateActionSheet + MonthSheet + Upcoming Dates taps in HomeScreen

**Files:** Modify `apps/mobile/app/(tabs)/index.tsx`

- [ ] **Step 1: Add imports + state at the top of HomeScreen component**

In `apps/mobile/app/(tabs)/index.tsx`, add these imports near the top (around line 13 where `AskKuyaModal` is imported):

```tsx
import { DateActionSheet } from '../../components/calendar/DateActionSheet'
import { MonthSheet } from '../../components/calendar/MonthSheet'
import { useDb } from '../../hooks/useDb'
import { notes as notesTable } from '../../db/schema'
import { eq } from 'drizzle-orm'
import { scheduleNoteReminder, cancelNoteReminder } from '../../services/notifications'
import type { QuickReminderPayload } from '../../components/calendar/QuickReminderForm'
```

(The `useDb`, `notesTable`, `eq`, `scheduleNoteReminder`, `cancelNoteReminder`, and `QuickReminderPayload` imports may already be partially present — only add what's missing.)

Inside the `HomeScreen` component body (the default-exported function, find where `const { /*...*/ } = useHomeStats()` is called), add new state for the sheets and the reminder day-index set:

```tsx
  const db = useDb()
  const [activeDayMs, setActiveDayMs] = useState<number | null>(null)
  const [showMonth, setShowMonth] = useState(false)

  // Derive day indices for amber reminder dots
  const reminderDays = useMemo(
    () => new Set(noteReminders.map(r => Math.floor(r.reminderAt / 86_400_000))),
    [noteReminders]
  )

  async function handleSaveReminder(payload: QuickReminderPayload) {
    const id = `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
    const now = Date.now()
    await db.insert(notesTable).values({
      id,
      title: payload.title,
      content: payload.content,
      type: payload.type,
      isPinned: false,
      isArchived: false,
      isTrashed: false,
      reminderAt: payload.reminderAt,
      createdAt: now,
      updatedAt: now,
    })
    try {
      await scheduleNoteReminder(id, payload.title, new Date(payload.reminderAt))
    } catch (err) {
      console.warn('[home/reminder] schedule failed:', err)
    }
    setActiveDayMs(null)
    void refresh()
  }

  async function handleDeleteReminder(noteId: string) {
    await db.update(notesTable)
      .set({ reminderAt: null, updatedAt: Date.now() })
      .where(eq(notesTable.id, noteId))
    try { await cancelNoteReminder(noteId) } catch {}
    void refresh()
  }

  function handleOpenNoteEditor(noteId: string) {
    setActiveDayMs(null)
    router.push(`/notes/${noteId}`)
  }

  function handleOpenListing(slug: string) {
    setActiveDayMs(null)
    router.push(`/listings/${slug}`)
  }
```

Make sure `refresh` is destructured from `useHomeStats()` if not already.

- [ ] **Step 2: Update CalendarStrip call site**

Find the existing line:
```tsx
            <CalendarStrip importantDays={importantDays} practiceDays={practiceDays} />
```

Replace with:
```tsx
            <CalendarStrip
              importantDays={importantDays}
              practiceDays={practiceDays}
              reminderDays={reminderDays}
              onDayPress={setActiveDayMs}
              onHeaderPress={() => setShowMonth(true)}
            />
```

- [ ] **Step 3: Wrap Upcoming Dates rows in Pressable**

Find the existing `upcomingDates.map(item => {...return <View ... />})` block (around lines 588-609). Replace the outer `<View key={item.slug} style={s.upcomingCard}>` opening tag with:

```tsx
                  <Pressable
                    key={item.slug}
                    style={s.upcomingCard}
                    onPress={() => {
                      if (item.entryType === 'reminder') {
                        router.push(`/notes/${item.slug}`)
                      } else {
                        router.push(`/listings/${item.slug}`)
                      }
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${item.title}`}
                  >
```

And change the matching closing `</View>` (the one wrapping the whole card) to `</Pressable>`. The inner Views (icon, body, badge) remain as Views.

- [ ] **Step 4: Render the sheets**

At the very bottom of the JSX (just BEFORE the existing `<NotificationModal />`, `<AskKuyaModal />`, etc. at the end of HomeScreen), add:

```tsx
      <DateActionSheet
        visible={activeDayMs != null}
        dayStartMs={activeDayMs ?? 0}
        onClose={() => setActiveDayMs(null)}
        onSaveReminder={handleSaveReminder}
        onOpenNoteEditor={handleOpenNoteEditor}
        onOpenListing={handleOpenListing}
        onDeleteReminder={handleDeleteReminder}
      />
      <MonthSheet
        visible={showMonth}
        onClose={() => setShowMonth(false)}
        onDayPress={(ms) => {
          setShowMonth(false)
          setActiveDayMs(ms)
        }}
        importantDays={importantDays}
        reminderDays={reminderDays}
        practiceDays={practiceDays}
      />
```

(Use a tiny setTimeout if needed to let the MonthSheet finish dismiss-animation before DateActionSheet opens; on iOS modals don't stack well. Test without the setTimeout first.)

- [ ] **Step 5: Type-check + tests**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -v "node_modules" | head -20
cd apps/mobile && pnpm jest "tabs/__tests__/home" 2>&1 | tail -10
```

Expected: tsc clean. home.test.tsx tests still passing (we didn't change anything that broke them).

- [ ] **Step 6: Commit**

```bash
git add apps/mobile/app/\(tabs\)/index.tsx
git commit -m "feat(mobile/home): wire DateActionSheet + MonthSheet + tappable Upcoming Dates rows"
```

---

## Task 8: Full mobile suite + push

**Files:** none

- [ ] **Step 1: Full mobile test suite**

```bash
cd apps/mobile && pnpm test 2>&1 | tail -5
```

Expected: all previously-passing tests + the new ones added in Tasks 1-5 pass. Baseline before this work was 474/474. We add ~5 + 5 + 6 + 5 + 6 = 27 new tests. Target: 501/501 passing.

If any pre-existing test broke, investigate before committing further.

- [ ] **Step 2: Type-check both apps**

```bash
cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -v node_modules | head -10
cd apps/admin && pnpm exec tsc --noEmit 2>&1 | grep -v node_modules | head -10
```

Expected: no new errors in mobile. Admin's pre-existing backfill test errors are unchanged.

- [ ] **Step 3: Bump appVersion + ship OTA**

This calendar feature is pure JS — no native module added (we deliberately stayed on React Native Modal). No `appVersion` bump needed; OTA picks up the change.

```bash
cd "C:\Users\User\OneDrive\Desktop\IskotifyApp" && git push origin master
```

Then trigger the EAS Update:
```bash
cd apps/mobile && npx eas-cli update --branch preview --message "feat(calendar): tap any day to manage reminders + tap-through upcoming dates" --non-interactive
```

Expected: OTA published successfully. URL and update group ID in output.

- [ ] **Step 4: Manual smoke test (after OTA lands)**

1. Open the app, tap any day in the 7-day strip on home → DateActionSheet opens
2. On an empty day, type a title + tap Save → sheet dismisses, amber dot appears under that day
3. Pull-to-refresh home → Upcoming Dates now shows the new reminder
4. Tap the month label "May 2026" header → MonthSheet opens with full grid
5. Tap a day in MonthSheet → MonthSheet dismisses, DateActionSheet opens for that day
6. Tap an existing reminder in DateActionSheet → navigates to /notes/<id>
7. Tap an exam pill → navigates to /listings/<slug>
8. Tap a reminder's trash icon → reminder removed from list, amber dot disappears
9. Tap an Upcoming Dates reminder row → navigates to /notes/<id>
10. Tap an Upcoming Dates exam row → navigates to /listings/<slug>

---

## Self-review against the spec

- §3 Journey A (add reminder on empty day) — Tasks 2, 4, 7 (form + sheet + parent handler) ✓
- §3 Journey B (view/edit on day with data) — Tasks 3, 4, 7 ✓
- §3 Journey C (browse a future month) — Tasks 5, 6, 7 ✓
- §3 Journey D (tap Upcoming row) — Task 7 step 3 ✓
- §4 Component architecture — all files created in Tasks 1-5, wired in 6-7 ✓
- §5 useDateReminders — Task 1 ✓
- §6 Sub-decisions — defaults baked into Task 2 (noon, text default), Task 3 (delete sets reminderAt=null), Task 7 (parent handlers) ✓
- §7 New + modified files — full coverage ✓
- §8 Visual palette — amber `#fbbf24` introduced in Tasks 5, 6 ✓
- §9 Testing strategy — 27 new tests across 5 task files + Task 8 step 1 full-suite gate ✓
- §10 Failure modes — handled inline (notification permission denied → console.warn, deletion uses Drizzle null update) ✓
- §11 Out of scope — not implemented (correctly) ✓
