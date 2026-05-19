# Calendar Navigation & Weak Areas UI Design

## Goal

Add week-by-week navigation to the home calendar strip (with month indicator and jump-to-exam), and replace the weak areas chip list with informative cards that show accuracy percentages and color-coded severity.

## Architecture

All changes are isolated to two files: `apps/mobile/app/(tabs)/index.tsx` (UI) and `apps/mobile/hooks/useHomeStats.ts` (minor data shape change). No new screens, no new routes, no new packages.

---

## Feature 1: Navigable Calendar Strip

### Data Layer (`useHomeStats.ts`)

Replace `calendarDays: CalendarDay[]` in `HomeStats` with two flat index arrays:

```ts
importantDayIndices: number[]   // UTC day indices (ms / 86_400_000) with exam or deadline
practiceDayIndices:  number[]   // UTC day indices where the user practiced
```

The `CalendarDay` interface and `computeCalendarDays` function are removed from the hook. The `CalendarStrip` component owns all week-window computation so it can navigate freely without re-querying the DB.

The hook computes these from the existing focused-listings join and `allProgress` query:

```ts
importantDayIndices: [
  ...focusedRows.flatMap(r => [
    r.examDate  != null ? Math.floor(r.examDate  / 86_400_000) : null,
    r.deadline  != null ? Math.floor(r.deadline  / 86_400_000) : null,
  ]).filter((d): d is number => d != null),
],
practiceDayIndices: allProgress.map(p => Math.floor(p.answeredAt / 86_400_000)),
```

### Component Layer (`index.tsx` — `CalendarStrip`)

`CalendarStrip` gains its own `weekOffset` state (`useState(0)`).

**Visible window:** 7 days centered on `today + weekOffset * 7`. Day letters S/M/T/W/T/F/S, 28×28 circles, practice dot (blue) and exam/deadline dot (red) remain unchanged.

**Month label:** derived from the center day of the current window. If the window spans two calendar months, shows "May – Jun 2026". Rendered between the ◀ and ▶ arrows.

**◀ / ▶ arrows:** `weekOffset -= 1` / `weekOffset += 1`. Always visible.

**[Today] pill:** visible only when `weekOffset !== 0`. Tapping resets `weekOffset` to 0.

**[📌 Next Exam] pill:** visible when at least one `importantDayIndex` is in the future. Tapping sets `weekOffset` to `Math.round((nearestFutureImportantDay - todayDay) / 7)`, centering the exam date in the strip.

**Layout:**
```
Row 1: ◀  [month label]  ▶    [Today] or [📌 Next Exam]
Row 2: S   M   T   W   T   F   S          (day letters)
Row 3: 24  25  26  27  28  29  30         (day circles)
Row 4:  •               📌               (dots)
```

The Today and Next Exam pills are right-aligned. When `weekOffset === 0` and a future exam exists, show Next Exam. When `weekOffset !== 0`, show Today. When `weekOffset !== 0` AND a future exam exists, show both (or only Today to keep it simple — show Today only when away from home week, Next Exam only when on home week and exam is future).

**Simplified pill logic:**
- `weekOffset !== 0` → show [Today] pill
- `weekOffset === 0` AND future exam exists → show [📌 Next Exam] pill
- Both conditions → show [Today] pill only (reset first, then jump)

### Props interface

```ts
interface CalendarStripProps {
  importantDays: Set<number>   // pre-converted from importantDayIndices
  practiceDays: Set<number>    // pre-converted from practiceDayIndices
}
```

The parent `HomeScreen` converts the arrays to Sets once and passes them down.

---

## Feature 2: Weak Areas — Card List with Progress Bars

### Color tiers

| Accuracy | Color | Label |
|----------|-------|-------|
| 0–30%    | `#ef4444` (red)    | Critical |
| 31–50%   | `#f97316` (orange) | Needs Work |
| 51–59%   | `#eab308` (amber)  | Almost There |

### Card anatomy (per weak topic)

```
┌──────────────────────────────────────────────────────┐
│  ●  Algebra                              45%      ›  │
│     ████████████░░░░░░░░░░░░░░░░░░░░░░░░            │
└──────────────────────────────────────────────────────┘
```

- **Left dot:** 8×8 filled circle in tier color
- **Topic name:** `Outfit_700Bold` 12px white
- **Accuracy %:** `Outfit_700Bold` 12px in tier color, right-aligned
- **Chevron ›:** muted right side, indicates tappable
- **Progress bar:** 3px tall, tier color fill on `rgba(255,255,255,0.08)` track, `width: \`${accuracy}%\`` — bar fills to the achieved accuracy level (e.g. 45% fills 45% of the bar width)

Card background: `rgba(255,255,255,0.07)`, border `rgba(255,255,255,0.10)`, borderRadius 14, padding 12, marginBottom 6. Tapping navigates to `/practice/:topicId`.

### Helper function

```ts
function weakTopicColor(accuracy: number): string {
  if (accuracy <= 30) return '#ef4444'
  if (accuracy <= 50) return '#f97316'
  return '#eab308'
}
```

---

## Files

| File | Action |
|------|--------|
| `apps/mobile/hooks/useHomeStats.ts` | Remove `calendarDays`/`CalendarDay`, add `importantDayIndices`/`practiceDayIndices` |
| `apps/mobile/app/(tabs)/index.tsx` | Rewrite `CalendarStrip` with navigation; replace chips with cards |

## Out of Scope

- No new library dependencies
- No changes to practice screens, analytics, or other tabs
- No persistence of `weekOffset` across sessions (always starts at today)
- The `computeCalendarDays` pure function is removed; its logic is inlined into `CalendarStrip`

## Implementation Notes

- `computeCalendarDays` is currently exported and called in `useHomeStats.test.ts`. Removing it will leave a dead reference in the test file. The test file already has pre-existing TypeScript errors; removing the call to `computeCalendarDays` from the test is part of this task.
- `CalendarDay` is imported by name in `index.tsx` — that import must be removed when the type is deleted from the hook.
- `index.tsx` currently imports `type CalendarDay` from `useHomeStats` — replace with nothing (the type is no longer needed outside the component).
