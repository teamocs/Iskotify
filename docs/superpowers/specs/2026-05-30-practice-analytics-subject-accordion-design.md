# Design: Subject Accordion for Practice + Analytics

**Date:** 2026-05-30
**Status:** Approved (pending spec review)
**Owner:** chrisraro

---

## 1. Context

The mobile app's Practice tab and Analytics tab both currently render topics as **flat lists** with no Subject grouping. Topics from Mathematics, Science, Filipino, etc. are mixed together. For users with many topics across multiple subjects, this is hard to scan and offers no sense of subject-level progress.

Today's structure:

- **Practice tab** (`apps/mobile/app/(tabs)/practice.tsx`) — 6 sections: AI banner, My Focus, Quick Start, Recommended, Saved Decks, and **All Topics** (flat list). Subject filter chips exist at the top but only filter the flat list.
- **Analytics tab** (`apps/mobile/app/(tabs)/analytics.tsx`) — Header, listing tabs, stats grid, weekly chart, **Topic Mastery** (flat bar-chart list), Recent Sessions.

The user wants the flat list in each tab replaced with a Subject-grouped accordion, scoped to their focus list when set. This is Spec 1 of a 3-spec decomposition (the other two — calendar interactivity and Google Calendar sync — are independent and out of scope here).

---

## 2. Goals / Non-goals

### Goals

- Group topics under their parent Subject in both Practice and Analytics using a shared **accordion** UI pattern (collapsible per-subject sections).
- Filter to focus-relevant subjects + topics when the user has any focus listings set; show everything when focus list is empty.
- Sort context-aware: weakest first in Practice (surface "what to study next"), strongest first in Analytics (celebrate progress).
- Reuse existing data hooks (`usePracticeData`, `useAnalytics`, `useFocusListings`) and existing row components (`TopicCard`, the topic mastery bar) — no data model changes.
- One shared `<SubjectAccordion>` component with a generic row type so Practice and Analytics use the same hierarchy with different inner content.

### Non-goals

- Expand/collapse state persistence across app sessions (v1 is local React state only).
- New data queries or schema changes.
- Touching Quick Start / Recommended / Saved Decks / weekly chart / stats grid / recent sessions — those serve different purposes and stay as-is.
- Calendar interactivity, Upcoming Dates click action, Google Calendar sync — separate specs.
- Search within accordion (use existing filters above).
- Drag-to-reorder subjects or topics.

---

## 3. Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  EXISTING DATA HOOKS (unchanged)                                         │
│  • usePracticeData() → { subjects, topicRows, topicIdsByListingSlug, … } │
│  • useAnalytics(slug) → { topicMastery, … }                              │
│  • useFocusListings() → { focusListingsList }                            │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  (new pure helper)
┌──────────────────────────────────────────────────────────────────────────┐
│  apps/mobile/utils/groupTopicsBySubject.ts                               │
│                                                                          │
│  groupTopicsBySubject<T>({                                               │
│    topics, subjects,                                                     │
│    focusListingSlugs?, topicIdsByListingSlug?,                           │
│  }, rowFor, summaryFor?, sort?) : SubjectGroup<T>[]                      │
│                                                                          │
│  • Applies focus-list filter when slugs non-empty                        │
│  • Groups topics by subjectId, drops empty subjects                      │
│  • Sorts per `sort` param: 'accuracy-asc' / 'accuracy-desc' / 'alpha'    │
│  • Maps each topic via rowFor() to caller's row shape T                  │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                                  ▼  (new shared component)
┌──────────────────────────────────────────────────────────────────────────┐
│  apps/mobile/components/SubjectAccordion.tsx                             │
│                                                                          │
│  <SubjectAccordion<T>                                                    │
│     groups={…}                                                           │
│     emptyText={…}                                                        │
│     initiallyExpanded="first" | "all" | "none"                           │
│     renderRow={(row: T) => <YourRowComponent {…} />}                     │
│  />                                                                      │
│                                                                          │
│  Owns: expand/collapse state, header layout, tap-to-toggle               │
│  Consumer owns: the inner row UI                                          │
└──────────────────────────────────────────────────────────────────────────┘
                                  │
                ┌─────────────────┴──────────────────┐
                ▼                                    ▼
┌──────────────────────────────┐    ┌──────────────────────────────────┐
│ practice.tsx                 │    │ analytics.tsx                    │
│ • Replaces "All Topics"      │    │ • Replaces "Topic Mastery"       │
│ • sort: 'accuracy-asc'       │    │ • sort: 'accuracy-desc'          │
│ • renderRow → <TopicCard>    │    │ • renderRow → mastery bar        │
│ • Focus-list scoped          │    │ • Listing-tab scoped (existing)  │
└──────────────────────────────┘    └──────────────────────────────────┘
```

**Key principles:**

1. **Minimal data changes.** `usePracticeData` already exposes `subjectId` on each topic row — no change needed. `useAnalytics.topicMastery` does NOT currently include subject info — extend its `TopicMastery` interface with optional `topicId` + `subjectId` so the accordion can group (see §6.6).
2. **Generic row type `T`.** Each consumer passes its own row shape and render function; the accordion only cares about subjects and the per-subject summary.
3. **Local state only.** Expand/collapse is `useState` inside `<SubjectAccordion>`. Persistence is out of scope for v1.
4. **No double-filtering in Analytics.** Analytics already scopes data via the listing-tab UI; the accordion does NOT additionally apply a focus filter there.
5. **Deck entries excluded from Analytics accordion.** `topicMastery` mixes topic and deck entries (key is `topicId || deckId`); decks have no subject and are filtered out of the accordion. They stay visible in Recent Sessions.

---

## 4. Component API

### 4.1 `<SubjectAccordion>` props

```ts
interface SubjectGroup<T> {
  subjectId: string
  subjectName: string
  rows: T[]
  summary?: string  // e.g. "5 topics · 67% avg" — caller computes
}

interface SubjectAccordionProps<T> {
  groups: SubjectGroup<T>[]
  emptyText?: string                                // shown when groups is empty
  initiallyExpanded?: 'first' | 'all' | 'none'      // default: 'first'
  renderRow: (row: T) => React.ReactNode            // caller provides the topic-row UI
}

export function SubjectAccordion<T>(props: SubjectAccordionProps<T>): JSX.Element
```

**Internal state:** `useState<Record<string, boolean>>` keyed by `subjectId`, seeded from `initiallyExpanded`. Toggling a subject header flips its key.

**Header layout per subject:**
- Pressable row, full width
- Left: chevron (▶ collapsed / ▼ expanded) + subject name (bold)
- Right: `summary` text (small, muted)
- Padding 12px vertical, 16px horizontal; thin divider below

**Expanded body:**
- Renders `rows.map(renderRow)` with 12px left indent for visual hierarchy

### 4.2 `groupTopicsBySubject` helper

```ts
// apps/mobile/utils/groupTopicsBySubject.ts

type SortMode = 'accuracy-asc' | 'accuracy-desc' | 'alpha'

interface GroupInput<R extends { id: string; name: string; subjectId: string; accuracy?: number | null }> {
  topics: R[]
  subjects: Array<{ id: string; name: string }>
  focusListingSlugs?: string[]                          // if non-empty → filter to focus
  topicIdsByListingSlug?: Record<string, string[]>      // from usePracticeData
}

function groupTopicsBySubject<R extends { id: string; name: string; subjectId: string; accuracy?: number | null }, T>(
  input: GroupInput<R>,
  rowFor: (topic: R) => T,
  summaryFor?: (rows: T[], rawTopics: R[]) => string,
  sort?: SortMode,
): SubjectGroup<T>[]
```

**Behavior:**

1. **Focus filter** — when `focusListingSlugs` non-empty:
   - Build `Set<string>` of allowed topic IDs by unioning `topicIdsByListingSlug[slug]` for each focus slug
   - Filter `topics` to only those IDs
2. **Group** remaining topics by `subjectId`
3. **Drop** subjects whose group is empty
4. **Sort** per `sort` param (default `'alpha'`):
   - `'accuracy-asc'` — subjects by ascending avg accuracy; topics inside same way. Treat `accuracy == null` (unpracticed) as **0** so new topics sort to the top in Practice.
   - `'accuracy-desc'` — subjects by descending avg accuracy; topics inside same way. Treat `accuracy == null` as **-1** so new topics sort to the bottom in Analytics.
   - `'alpha'` — subjects by name A→Z; topics by name A→Z within.
5. **Map** each topic via `rowFor(topic)` to the caller's row type
6. **Compute summary** via `summaryFor(rows, rawTopics)` if provided; otherwise omit

Pure function, no React. Avg-accuracy helper:

```ts
function avgAccuracy(topics: Array<{ accuracy?: number | null }>): number {
  const practiced = topics.filter(t => t.accuracy != null) as Array<{ accuracy: number }>
  if (practiced.length === 0) return 0
  return Math.round(practiced.reduce((s, t) => s + t.accuracy, 0) / practiced.length)
}
```

---

## 5. Practice tab integration

### 5.1 Replacement target

The current `<SectionTitle>All Topics</SectionTitle>` + `<FlatList of TopicCard>` block at the bottom of `apps/mobile/app/(tabs)/practice.tsx`.

### 5.2 Rendered shape

```
... (existing My Focus, Quick Start, Recommended, Saved Decks above) ...

SUBJECTS                                          focus: UPCAT, DOST-SEI
─────────────────────────────────────────────────────────────────────────
▼ Mathematics                              5 topics · 32% avg
   ⚠ Algebra            5 cards · 32% · Weak       ›
   ⚠ Trigonometry       4 cards · 45% · Weak       ›
   ◷ Calculus           3 cards · 60% · Review     ›
   ◇ Statistics         4 cards · New              ›
   ★ Geometry           6 cards · 82% · Strong     ›

▶ Science                                  3 topics · 51% avg

▶ Filipino                                 2 topics · 78% avg
```

### 5.3 Behaviors

- **Subject sort** — `accuracy-asc` → weakest avg first
- **Topic sort within subject** — `accuracy-asc` → weakest topics first; new topics (no accuracy) sort to the top (treated as 0% for ordering purposes)
- **Initial expansion** — `"first"` (weakest subject expanded by default)
- **Subject summary** — `"{N} topics · {avg}% avg"`. If all topics are new: `"{N} topics · New"`
- **Topic row** — re-use existing `TopicCard` with no visual rewrite. Tap → `router.push(`/practice/${topicId}`)`
- **Section header** — `SUBJECTS` (was `ALL TOPICS`); small subtitle showing active focus slugs when focus list non-empty

### 5.4 Wiring (sketch)

```tsx
import { groupTopicsBySubject } from '../../utils/groupTopicsBySubject'
import { SubjectAccordion } from '../../components/SubjectAccordion'

const subjectGroups = useMemo(() => groupTopicsBySubject(
  {
    topics: topicRows.map(r => ({
      id: r.topic.id,
      name: r.topic.name,
      subjectId: r.topic.subjectId,
      accuracy: r.accuracy,
      cardCount: r.cardCount,
      strength: r.strength,
      lastPracticedAt: r.lastPracticedAt,
    })),
    subjects: allSubjects,
    focusListingSlugs: focusListingsList.map(l => l.slug),
    topicIdsByListingSlug,
  },
  (topic) => topic,  // pass-through; TopicCard reads everything off topic
  (rows) => {
    const allNew = rows.every(r => r.accuracy == null)
    return allNew ? `${rows.length} topics · New` : `${rows.length} topics · ${avgAccuracy(rows)}% avg`
  },
  'accuracy-asc',
), [topicRows, allSubjects, focusListingsList, topicIdsByListingSlug])

return (
  // ... existing sections unchanged above ...
  <SubjectAccordion
    groups={subjectGroups}
    emptyText={focusListingsList.length > 0
      ? "Your focus list doesn't have topics yet — they'll appear here after sync"
      : "No topics yet"}
    initiallyExpanded="first"
    renderRow={(row) => <TopicCard {...row} />}
  />
)
```

### 5.5 Empty states

| Condition | Behavior |
|---|---|
| No focus list AND no topics anywhere | Existing "No topics yet" placeholder (unchanged) |
| Focus list set BUT none of those listings have topics | "Your focus list doesn't have topics yet — they'll appear here after sync" |
| Single subject in focus | Still render the accordion with one section (consistent UX vs. one-off no-accordion mode) |

---

## 6. Analytics tab integration

### 6.1 Replacement target

The current "Topic Mastery" section in `apps/mobile/app/(tabs)/analytics.tsx` — a flat list of topics with horizontal accuracy bars.

### 6.2 Rendered shape

```
... (existing Header, listing tabs, stats grid, weekly chart above) ...

SUBJECT MASTERY                                       scope: Overall
─────────────────────────────────────────────────────────────────────────
▼ Filipino                                 2 topics · 78% avg
   Panitikan          ████████░░  78%
   Wikang Filipino    ███████░░░  72%

▶ Mathematics                              5 topics · 51% avg

▶ Science                                  3 topics · 32% avg

... (existing Recent Sessions below) ...
```

### 6.3 Behaviors

- **Subject sort** — `accuracy-desc` → strongest avg first
- **Topic sort within subject** — `accuracy-desc` → strongest topics first; never-practiced topics filtered OUT entirely (Mastery view only shows topics with practice data)
- **Initial expansion** — `"first"` (highest-performing subject expanded by default — celebrates progress)
- **Subject summary** — `"{N} topics · {avg}% avg"` (same as Practice)
- **Topic row** — re-use today's topic-mastery row layout: name + horizontal accuracy bar + accuracy%. Color thresholds unchanged (green ≥80% / amber ≥60% / red <60%). Tap target: none in v1.
- **Section header** — `SUBJECT MASTERY` (was `TOPIC MASTERY`); small subtitle shows active listing tab scope ("Overall" or listing title)
- **Deck entries excluded** — `topicMastery` today mixes topic and deck entries (key is `topicId || deckId`). Deck entries don't have a subject, so they're filtered out of the accordion. They remain visible in Recent Sessions (unchanged).

### 6.4 Listing tab interaction

The existing "Overall / UPCAT / DOST-SEI / …" tab strip at the top stays. When the user switches tabs, `useAnalytics(slug).topicMastery` returns the new data and `groupTopicsBySubject` re-runs. All expanded/collapsed state is local to a single render — switching tabs starts fresh expansion state.

### 6.5 No focus-list filter

Analytics already scopes by listing via the tab UI. The accordion does NOT additionally apply a focus filter (no double-filtering). This is the one behavioral difference from Practice.

### 6.6 Required `useAnalytics` extension

`useAnalytics.topicMastery` items today carry only `{ label, accuracy, sessionCount }` — no topic ID or subject ID. To group by subject we extend the type and the hook's computation:

```ts
// apps/mobile/hooks/useAnalytics.ts
export interface TopicMastery {
  label: string
  accuracy: number
  sessionCount: number
  topicId?: string     // NEW — undefined for deck-backed entries
  subjectId?: string   // NEW — undefined for deck-backed entries
}
```

Inside the hook, change line ~99 from:
```ts
const topicMap = new Map(topicRows.map(t => [t.id, t.name]))
```
to include subjectId:
```ts
const topicMap = new Map(topicRows.map(t => [t.id, { name: t.name, subjectId: t.subjectId }]))
```

And in the `topicMastery` mapping (line ~111), populate the new fields when the entry is topic-backed (not deck-backed):
```ts
.map(([key, v]) => {
  const topic = topicMap.get(key)
  return {
    label: topic?.name ?? deckMap.get(key) ?? resolveTopicLabel(key, new Map()),
    accuracy: Math.round((v.score / v.total) * 100),
    sessionCount: v.count,
    topicId: topic ? key : undefined,
    subjectId: topic?.subjectId,
  }
})
```

Existing consumers reading `label` / `accuracy` / `sessionCount` are unaffected. The two new fields are optional.

### 6.7 Wiring (sketch)

```tsx
import { groupTopicsBySubject } from '../../utils/groupTopicsBySubject'
import { SubjectAccordion } from '../../components/SubjectAccordion'

const subjectGroups = useMemo(() => {
  // Mastery view only shows topic-backed entries (decks filtered out — they have no subject)
  const topicEntries = topicMastery.filter(t => t.topicId && t.subjectId)
  return groupTopicsBySubject(
    {
      topics: topicEntries.map(t => ({
        id: t.topicId!,
        name: t.label,
        subjectId: t.subjectId!,
        accuracy: t.accuracy,
        sessionCount: t.sessionCount,
      })),
      subjects: allSubjects,
      // No focus filter — listing tab already scopes
    },
    (topic) => topic,
    (rows) => `${rows.length} topics · ${avgAccuracy(rows)}% avg`,
    'accuracy-desc',
  )
}, [topicMastery, allSubjects])

return (
  // ... existing sections unchanged above ...
  <SubjectAccordion
    groups={subjectGroups}
    emptyText="Start practicing to see mastery analytics"
    initiallyExpanded="first"
    renderRow={(row) => <TopicMasteryBar {...row} />}
  />
)
```

**About `TopicMasteryBar`** — today's Topic Mastery section likely renders the row JSX inline inside `analytics.tsx`. The implementer should either: (a) extract that JSX into a new `TopicMasteryBar` component file and import it from both the inline location (if still used elsewhere) and the accordion `renderRow`, OR (b) inline the same JSX inside the `renderRow` callback. Either is fine; extraction is mildly cleaner if the JSX is non-trivial.

### 6.8 Empty states

| Condition | Behavior |
|---|---|
| No topics practiced ever | "Start practicing to see mastery analytics" |
| Listing tab selected but no practice for that listing | "No practice sessions yet for this exam" |

---

## 7. Testing strategy

### 7.1 `groupTopicsBySubject` unit tests (Jest)

File: `apps/mobile/utils/__tests__/groupTopicsBySubject.test.ts`

- Empty input → empty output
- Single subject, multiple topics → one group with all topics
- Multiple subjects → one group per subject, drops subjects with no topics
- `focusListingSlugs` set + `topicIdsByListingSlug` matches → only allowed topics flow through; subjects with no allowed topics dropped
- `focusListingSlugs` set but no matching topic IDs → empty output
- `focusListingSlugs` empty → no filtering
- `sort: 'accuracy-asc'` → subjects ordered by ascending avg accuracy; topics inside same way; null accuracy treated as 0 (sorts to top)
- `sort: 'accuracy-desc'` → subjects ordered by descending avg accuracy; topics inside same way; null accuracy treated as -1 (sorts to bottom)
- `sort: 'alpha'` (default) → subjects by name A→Z; topics by name A→Z
- `summaryFor` callback invoked with correct args; returned summary stored on group
- `rowFor` mapping applied to each topic

### 7.2 `<SubjectAccordion>` component tests (Jest + React Native Testing Library)

File: `apps/mobile/components/__tests__/SubjectAccordion.test.tsx`

- Renders empty state with `emptyText` when `groups.length === 0`
- Renders each subject header with its `summary`
- `initiallyExpanded="first"` → first subject's body rendered, others collapsed
- `initiallyExpanded="all"` → all bodies rendered
- `initiallyExpanded="none"` → no bodies rendered (only headers)
- Pressing a collapsed header → that subject's body appears
- Pressing an expanded header → that subject's body disappears
- `renderRow` invoked for each row when subject is expanded
- Two subjects' expansion states are independent

### 7.3 Practice + Analytics integration

The existing tests for these tabs (where present) need to be updated to reflect the new section structure. Specifically:
- Tests asserting on flat-list rendering of topics need to use accordion-aware queries (e.g. open the relevant subject's accordion first, then query for the topic)
- Tests for the existing sections (Banner, My Focus, Quick Start, Recommended, Saved Decks, Stats Grid, Weekly Chart, Recent Sessions) should be unaffected

### 7.4 Baseline preservation

The mobile test suite currently has 14 pre-existing failures (llm, sync, useModelDownload, home, profile). This change must not regress that baseline.

---

## 8. Rollout

This is a pure-mobile UI change. No backend, no schema, no Vercel deploy needed.

1. Implement helper + component + tests (TDD per file)
2. Wire into Practice tab
3. Wire into Analytics tab
4. Push mobile OTA via `eas update --channel preview`
5. Verify on device:
   - Open Practice tab, accordion shows subjects sorted weakest-first, weakest expanded
   - Expand/collapse a subject — topics show/hide
   - Set focus list to one or two exams — only relevant subjects/topics appear
   - Clear focus list — all subjects appear
   - Open Analytics tab, accordion shows subjects sorted strongest-first, strongest expanded
   - Switch listing tabs — accordion re-groups
   - All other sections (Quick Start, Recommended, weekly chart, etc.) unchanged

### Rollback

OTA-only change. Roll back via `eas update:republish --group <previous-group-id>`.

---

## 9. Risks / mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| User has 10+ subjects → accordion is long even when collapsed | Medium | UI is noisy | Headers are compact; scrolling works as-is. If real users complain, add a "collapse all" button in v2. |
| Subject summary `{N} topics · {avg}% avg` is misleading when subject has both practiced and unpracticed topics | Low | One unpracticed topic doesn't affect the avg display significantly | `avgAccuracy()` only averages practiced topics. Subject still includes unpracticed topics in the visible list (Practice context). For Analytics, unpracticed are filtered out entirely so no skew. |
| New topics (accuracy=null) ordering surprises users | Low | New topics sort to top in Practice (correct behavior — they're "what to study next") | Make this explicit in the row UI: "New" badge instead of an accuracy %. Users will get used to seeing new topics at the top. |
| Per-subject expansion state lost on tab navigation | Low | User has to re-expand after switching tabs | `initiallyExpanded='first'` minimizes this — at least one subject is always expanded. Persistence is a v2 enhancement. |
| Analytics tab's listing-tab switch loses expansion state | Low | Same as above | Same mitigation. |
| `groupTopicsBySubject` perf with 100+ topics | Very low | O(n) grouping + O(n log n) sort — well under 16ms even at 1000 topics | `useMemo` wraps the call so it only re-runs when inputs change |

---

## Appendix A — File-level change list

### New files

| Path | Responsibility |
|---|---|
| `apps/mobile/utils/groupTopicsBySubject.ts` | Pure grouping + filter + sort helper |
| `apps/mobile/utils/__tests__/groupTopicsBySubject.test.ts` | Helper unit tests |
| `apps/mobile/components/SubjectAccordion.tsx` | Generic accordion component |
| `apps/mobile/components/__tests__/SubjectAccordion.test.tsx` | Component tests |

### Modified files

| Path | Change |
|---|---|
| `apps/mobile/hooks/useAnalytics.ts` | Extend `TopicMastery` interface with optional `topicId` + `subjectId`; populate them for topic-backed entries (decks remain undefined). Existing consumers unaffected. |
| `apps/mobile/app/(tabs)/practice.tsx` | Replace "All Topics" section with `<SubjectAccordion>` wired to `groupTopicsBySubject` (focus-list scoped, accuracy-asc sort) |
| `apps/mobile/app/(tabs)/analytics.tsx` | Replace "Topic Mastery" section with `<SubjectAccordion>` wired to `groupTopicsBySubject` (listing-tab scoped, accuracy-desc sort, deck entries filtered out) |

### No changes

- Existing data hooks `usePracticeData` and `useFocusListings`
- Existing row components (`TopicCard` and the topic-mastery row JSX, which may be extracted into a small `TopicMasteryBar` component per §6.7 note)
- DB schema, sync, Supabase, admin app

---

## Appendix B — Out of scope (deferred to v2 or other specs)

- Expand/collapse state persistence across app sessions
- Search within accordion
- Drag-to-reorder subjects or topics
- Tap-to-filter-stats on Analytics topic rows
- Calendar interactivity, Upcoming Dates click action (Spec 2)
- Google Calendar sync (Spec 3)
