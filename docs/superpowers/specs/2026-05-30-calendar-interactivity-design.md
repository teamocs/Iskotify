# Calendar Interactivity + Reminder Sync — Design

**Date:** 2026-05-30
**Author:** session brainstorming with user
**Status:** Spec 2 of the original 3-spec calendar/reminders/google-sync arc (Spec 3 = Google Calendar sync, still deferred).

## 1. Goal

Make the existing 7-day calendar strip on the mobile home screen **fully interactive**:
- Tap any day → bottom sheet that shows that day's existing reminders + exam dates, with an inline form to add a new reminder when the day is empty.
- Tap the calendar header → expandable full-month sheet for browsing/planning beyond 7 days, with the same tap-to-add behaviour.
- Tap any row in "Upcoming Dates" → jumps to the right place (`/listings/<slug>` for exam/deadline rows, `/notes/<noteId>` for reminder rows).
- New reminders sync to the existing Notes feature via `notes.reminderAt`, ride the existing `pushUserData`/`pullUserData` pipeline, and trigger native notifications via the existing `scheduleNoteReminder` helper.

## 2. Why this scope

Survey of the codebase showed that almost everything we need already exists:
- `notes.reminderAt` column already present in the Drizzle schema
- Bottom-sheet reminder picker already in the note editor (`apps/mobile/app/notes/[id].tsx`)
- `scheduleNoteReminder` / `cancelNoteReminder` already handle native notifications
- `useHomeStats` already merges note reminders into `noteReminders` for the home screen
- Listings already routable via `/listings/[slug]`
- React Native Modal pattern is the established bottom-sheet primitive (used in 4 places)

So this spec is mostly **wiring + 3 new components** rather than building from scratch. No DB migrations, no new dependencies, no schema changes.

## 3. User journeys

### Journey A — Add a reminder on an empty day

```
Home screen → tap Sat Nov 16 in the strip
  → DateActionSheet opens, shows empty state
  → QuickReminderForm shown: title input, [Text|Checklist] toggle, content/checklist input
  → Default reminder time: 12:00 PM of Nov 16
  → User types "Review Algebra Ch. 4" → tap [Save]
  → Note is created in local DB with reminderAt = Nov 16 12:00 PM ms epoch
  → Native notification scheduled via scheduleNoteReminder(id, title, date)
  → Sheet dismisses
  → Strip now shows an amber dot under Nov 16
  → Upcoming Dates section shows the new reminder
  → Next launch syncs the note to Supabase
```

### Journey B — View / edit / add on a day that already has items

```
Home screen → tap Mon Mar 9 (UPCAT exam day, plus user has 2 reminders)
  → DateActionSheet opens, shows list state
  → Top: read-only "UPCAT 2026 — Exam day" pill (tappable → /listings/upcat)
  → Middle: "Your reminders" section with 2 rows:
       • "Review chem at 9 AM" [Edit] [Trash icon]
       • "Pack ballpens at 7 AM" [Edit] [Trash icon]
  → Bottom: [+ Add reminder] button → switches sheet content to QuickReminderForm
  → Tap a reminder's [Edit] → opens inline edit (title + time) in the same sheet
  → Tap a reminder's trash icon → confirms + sets reminderAt=null (note itself preserved)
```

### Journey C — Browse a future month

```
Home screen → tap the calendar strip header (the "← Today 📌 Exam →" row)
  → MonthSheet opens (full-screen modal)
  → Shows current month grid with dots (blue=practice, maroon=exam, amber=reminder)
  → Swipe left/right OR tap arrows to switch months
  → Tap any day → DateActionSheet opens on top of MonthSheet (or dismisses + opens)
  → Same QuickReminderForm / list state as Journey A/B
```

### Journey D — Tap an Upcoming Dates row

```
Home screen → Upcoming Dates section → tap "UPCAT 2026 — Exam — Mar 9"
  → router.push('/listings/upcat')

Home screen → Upcoming Dates section → tap "Review chem — Tue"
  → router.push('/notes/<noteId>')   (existing note editor)
```

## 4. Component architecture

```
HomeScreen (existing index.tsx)
├── CalendarStrip (existing)         ← add onDayPress + onHeaderPress props
│
├── UpcomingDatesSection (existing)  ← wrap rows in Pressable, type-aware nav
│
└── DateActionSheet (NEW)            ← rendered conditionally at home level
        ├── (empty-day mode)         ← shows QuickReminderForm
        └── (data-day mode)          ← shows DayItemsList + [+ Add] button

    MonthSheet (NEW)                 ← rendered conditionally at home level
        └── tap day → calls same setSheetDate(...) as the strip's onDayPress

    QuickReminderForm (NEW)          ← shared form, used by DateActionSheet
        ├── title TextInput
        ├── [Text | Checklist] segmented control
        ├── content TextInput (text) OR ChecklistItems (checklist)
        ├── time row with [12:00 PM] pill → opens system time picker on tap
        ├── [Open in editor]  [Save]
```

The strip and the upcoming section are MINIMAL edits to existing components — just adding handlers + Pressables. All the new UI lives in three new files.

## 5. New hook — `useDateReminders`

```ts
// apps/mobile/hooks/useDateReminders.ts
interface DayItems {
  exams: Array<{ slug: string; title: string; type: 'exam' | 'deadline'; date: number }>
  reminders: Array<{ noteId: string; title: string; reminderAt: number; type: 'text' | 'checklist' }>
}

export function useDateReminders(dayStartMs: number): DayItems
```

Pure local-SQLite reads. Day boundary = midnight-to-midnight in device local time. Re-runs when the active day changes. Cached in component state with the calendar day index as the key.

## 6. Sub-decisions

| Choice | Resolution |
|---|---|
| Default reminder time | **12:00 PM** of selected date (sensible: not 00:00, not too late) |
| Default note type in quick-add | **Text**, with a [+ Add checklist] secondary action to switch mid-edit |
| "Delete reminder" semantics | Sets `reminderAt = null`, cancels native notification, keeps the note. Note can still be found in /notes (without a reminder). |
| "Trash note" from inside sheet | Available as secondary affordance — tap title row → opens /notes/[id] for full editor where trash button lives. Don't duplicate trash UX in the sheet. |
| Month sheet initial month | Current month |
| Month sheet navigation | Arrow buttons + swipe gesture; "Today" button to jump back; max range: 2 years past, 2 years future (avoids unbounded data fetching) |
| Dot color scheme | Blue = practice activity (existing), Maroon = exam date (existing), **Amber = reminder (NEW)** |
| Bottom-sheet library | **React Native Modal** (existing pattern across 4 places). No new dependency. |
| Multiple reminders on same day | Allowed. List sheet shows all. Each gets its own note in the DB. |
| Recurring reminders | **Out of scope** — single-shot only (existing schema constraint) |
| Notification scheduling | Reuses existing `scheduleNoteReminder` / `cancelNoteReminder` from notes feature. No new notification code. |
| Conflict resolution on sync | Last-write-wins (existing behavior for notes table). Acceptable for personal reminders. |

## 7. Files to create / modify

### New files

```
apps/mobile/components/calendar/DateActionSheet.tsx                conditional empty/data states
apps/mobile/components/calendar/MonthSheet.tsx                     full-month grid in a sheet
apps/mobile/components/calendar/QuickReminderForm.tsx              inline form
apps/mobile/components/calendar/DayItemsList.tsx                   list of exams + reminders for a day
apps/mobile/components/calendar/__tests__/DateActionSheet.test.tsx
apps/mobile/components/calendar/__tests__/MonthSheet.test.tsx
apps/mobile/components/calendar/__tests__/QuickReminderForm.test.tsx
apps/mobile/components/calendar/__tests__/DayItemsList.test.tsx
apps/mobile/hooks/useDateReminders.ts
apps/mobile/hooks/__tests__/useDateReminders.test.ts
```

### Modified files

```
apps/mobile/app/(tabs)/index.tsx          wire calendar.onDayPress + onHeaderPress; wire UpcomingDates row Pressables; render DateActionSheet + MonthSheet
apps/mobile/hooks/useHomeStats.ts         expose dayBuckets for amber-dot rendering (small helper export)
apps/mobile/app/(tabs)/__tests__/home.test.tsx    add tests for tap → sheet wiring
```

No DB schema changes. No new packages. No native rebuild required.

## 8. Visual / palette decisions

Match the existing app palette already used in CalendarStrip + note editor:
- Day cell background: existing theme tokens (`t.surface`, etc.)
- Today indicator: existing maroon circle
- Practice dot: existing `#60a5fa` blue
- Exam dot: existing `t.accentText` maroon
- **Reminder dot: amber `#fbbf24`** (matches the "draft" amber already used for badge in admin nav + notes labels)
- Bottom sheet background, handle bar, etc.: copy the patterns from the existing reminder picker modal in `apps/mobile/app/notes/[id].tsx`

## 9. Testing strategy

- **Unit**: `useDateReminders` — date-range filtering, exam + reminder merge, empty days
- **Component**: each new component with `@testing-library/react-native` — render, key interactions (tap day, tap save, tap edit), accessibility labels
- **Integration**: home screen test extended — tap day in CalendarStrip → DateActionSheet visible with right content; tap upcoming reminder row → router.push called with `/notes/<id>`
- **Manual**: native notification firing (can't test in jest), swipe gestures on month sheet, system time picker integration

## 10. Failure modes

- **Sync conflict** (same note edited on two devices simultaneously) → last-write-wins, existing behaviour. Worst case: one device's reminder edit overwrites the other's. Acceptable for personal reminders.
- **Notification permission denied** → existing `scheduleNoteReminder` already handles this; no native notification scheduled, but the note still saves with reminderAt set, so the in-app calendar/upcoming sections still surface it.
- **Time-zone change** → `reminderAt` is absolute ms epoch, calendar buckets use device local TZ. Crossing TZ boundaries could show a reminder on a different day than expected. Documented limitation, not addressed in v2.
- **Editing exam-pill row** → not allowed (read-only). Tapping it navigates to listing detail.

## 11. Out of scope (defer to Spec 3 or beyond)

- Google Calendar sync (Spec 3)
- Recurring reminders
- Drag-to-reorder reminders on a day
- Multi-day / range reminders
- Year view / yearly heatmap
- iOS / Android system-calendar import
- Pulling family/team shared reminders
- Notification rescheduling when the user reopens the app after the reminder fired but device was off
