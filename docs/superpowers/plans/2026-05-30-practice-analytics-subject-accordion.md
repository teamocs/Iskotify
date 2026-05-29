# Practice + Analytics Subject Accordion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat "All Topics" list in Practice and the flat "Topic Mastery" list in Analytics with a Subject-grouped accordion. Practice sorts weakest-first (focus-list scoped when set); Analytics sorts strongest-first (already scoped by the existing listing tab; decks excluded).

**Architecture:** One pure helper (`groupTopicsBySubject`) for filter/group/sort, one generic React Native component (`<SubjectAccordion>`) with local expand/collapse state, plus a minimal extension to `useAnalytics.TopicMastery` so it carries `topicId` + `subjectId` for grouping. No DB / backend / Supabase changes.

**Tech Stack:** TypeScript · React Native + Expo + Drizzle ORM · Jest (mobile tests) · EAS Update (OTA delivery).

**Spec reference:** [`docs/superpowers/specs/2026-05-30-practice-analytics-subject-accordion-design.md`](../specs/2026-05-30-practice-analytics-subject-accordion-design.md)

**Baseline:** The mobile test suite currently has 14 pre-existing failures (llm, sync, useModelDownload, home, profile suites). Do not regress this baseline.

---

## File Structure

### New files

| Path | Responsibility |
|---|---|
| `apps/mobile/utils/groupTopicsBySubject.ts` | Pure function: filter (focus list), group (by subjectId), sort (accuracy-asc / accuracy-desc / alpha), map to caller's row type. No React. |
| `apps/mobile/utils/__tests__/groupTopicsBySubject.test.ts` | Jest unit tests for the helper. |
| `apps/mobile/components/SubjectAccordion.tsx` | Generic React Native component. Owns expand/collapse state, header layout, tap-to-toggle. Consumer passes `groups`, `renderRow`, `emptyText`, `initiallyExpanded`. |
| `apps/mobile/components/__tests__/SubjectAccordion.test.tsx` | Jest + React Native Testing Library tests. |

### Modified files

| Path | Change |
|---|---|
| `apps/mobile/hooks/useAnalytics.ts` | Extend `TopicMastery` interface with optional `topicId` + `subjectId`. Update `topicMap` to include `subjectId`. Populate the new fields for topic-backed entries; leave them `undefined` for deck-backed entries. Existing consumers reading `label` / `accuracy` / `sessionCount` are unaffected. |
| `apps/mobile/app/(tabs)/practice.tsx` | Replace the "All Topics" section (the bottom `<SectionTitle>` + flat `<FlatList of TopicCard>`) with `<SubjectAccordion>` wired to `groupTopicsBySubject` with `accuracy-asc` sort and focus-list filter. Keep all other sections unchanged. |
| `apps/mobile/app/(tabs)/analytics.tsx` | Replace the "Topic Mastery" section with `<SubjectAccordion>` wired to `groupTopicsBySubject` with `accuracy-desc` sort. Filter `topicMastery` to only entries where both `topicId` and `subjectId` are set (drops deck entries). Keep all other sections unchanged. |

---

## Phase 1 — Foundation

### Task 1: `groupTopicsBySubject` helper + unit tests

**Files:**
- Create: `apps/mobile/utils/groupTopicsBySubject.ts`
- Create: `apps/mobile/utils/__tests__/groupTopicsBySubject.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/utils/__tests__/groupTopicsBySubject.test.ts`:

```ts
import { groupTopicsBySubject } from '../groupTopicsBySubject'

interface T {
  id: string
  name: string
  subjectId: string
  accuracy?: number | null
}

const subjects = [
  { id: 'sci', name: 'Science' },
  { id: 'math', name: 'Mathematics' },
  { id: 'fil', name: 'Filipino' },
]

const topics: T[] = [
  { id: 't1', name: 'Algebra',       subjectId: 'math', accuracy: 32 },
  { id: 't2', name: 'Geometry',      subjectId: 'math', accuracy: 82 },
  { id: 't3', name: 'Statistics',    subjectId: 'math', accuracy: null },
  { id: 't4', name: 'Photosynthesis', subjectId: 'sci', accuracy: 51 },
  { id: 't5', name: 'Genetics',       subjectId: 'sci', accuracy: null },
  // No Filipino topics — should be dropped from result
]

describe('groupTopicsBySubject', () => {
  describe('basic grouping', () => {
    it('returns empty array when given no topics', () => {
      const out = groupTopicsBySubject<T, T>({ topics: [], subjects }, t => t)
      expect(out).toEqual([])
    })

    it('groups topics by subjectId and drops subjects with no topics', () => {
      const out = groupTopicsBySubject<T, T>({ topics, subjects }, t => t)
      expect(out).toHaveLength(2) // Filipino dropped (no topics)
      const ids = out.map(g => g.subjectId).sort()
      expect(ids).toEqual(['math', 'sci'])
    })

    it('preserves subject name from the subjects array', () => {
      const out = groupTopicsBySubject<T, T>({ topics, subjects }, t => t)
      const math = out.find(g => g.subjectId === 'math')!
      expect(math.subjectName).toBe('Mathematics')
    })

    it('falls back to subjectId as name when subject not in subjects array', () => {
      const out = groupTopicsBySubject<T, T>(
        { topics: [{ id: 't1', name: 'Stray', subjectId: 'unknown' }], subjects },
        t => t,
      )
      expect(out[0]!.subjectName).toBe('unknown')
    })
  })

  describe('focus list filter', () => {
    const topicIdsByListingSlug = {
      upcat:    ['t1', 't4'],          // Algebra, Photosynthesis
      'dost-sei': ['t2'],              // Geometry
      ched:     ['t99'],               // unknown topic id — should be ignored
    }

    it('does not filter when focusListingSlugs is empty', () => {
      const out = groupTopicsBySubject<T, T>(
        { topics, subjects, focusListingSlugs: [], topicIdsByListingSlug },
        t => t,
      )
      // All 5 topics survive; 2 subjects (math, sci) remain
      expect(out).toHaveLength(2)
      const allTopics = out.flatMap(g => g.rows)
      expect(allTopics).toHaveLength(5)
    })

    it('does not filter when topicIdsByListingSlug is missing even if slugs provided', () => {
      const out = groupTopicsBySubject<T, T>(
        { topics, subjects, focusListingSlugs: ['upcat'] },
        t => t,
      )
      expect(out.flatMap(g => g.rows)).toHaveLength(5)
    })

    it('filters to union of allowed topic IDs across focus slugs', () => {
      const out = groupTopicsBySubject<T, T>(
        { topics, subjects, focusListingSlugs: ['upcat', 'dost-sei'], topicIdsByListingSlug },
        t => t,
      )
      // Allowed: t1, t2, t4 → math has [t1, t2], sci has [t4]
      const math = out.find(g => g.subjectId === 'math')!
      const sci  = out.find(g => g.subjectId === 'sci')!
      expect(math.rows.map(r => r.id).sort()).toEqual(['t1', 't2'])
      expect(sci.rows.map(r => r.id)).toEqual(['t4'])
    })

    it('drops subjects whose only topics were filtered out', () => {
      const out = groupTopicsBySubject<T, T>(
        { topics, subjects, focusListingSlugs: ['upcat'], topicIdsByListingSlug },
        t => t,
      )
      // Allowed: t1 (math), t4 (sci) → both subjects present
      expect(out).toHaveLength(2)
    })

    it('returns empty when focus slugs match no known topic ids', () => {
      const out = groupTopicsBySubject<T, T>(
        { topics, subjects, focusListingSlugs: ['ched'], topicIdsByListingSlug },
        t => t,
      )
      expect(out).toEqual([])
    })
  })

  describe('sorting', () => {
    it("'alpha' (default) sorts subjects A→Z and topics A→Z within", () => {
      const out = groupTopicsBySubject<T, T>({ topics, subjects }, t => t)
      expect(out.map(g => g.subjectName)).toEqual(['Mathematics', 'Science'])
      const math = out[0]!
      expect(math.rows.map(r => r.name)).toEqual(['Algebra', 'Geometry', 'Statistics'])
    })

    it("'accuracy-asc' sorts subjects by ascending avg accuracy; null treated as 0 (top)", () => {
      // math avg = (32 + 82 + 0[null→0]) / 3 = 38
      // sci  avg = (51 + 0[null→0]) / 2 = 25.5
      // → sci first, math second
      const out = groupTopicsBySubject<T, T>({ topics, subjects }, t => t, undefined, 'accuracy-asc')
      expect(out.map(g => g.subjectId)).toEqual(['sci', 'math'])
      // Within math: null (Statistics, treated as 0) → Algebra 32 → Geometry 82
      const math = out[1]!
      expect(math.rows.map(r => r.name)).toEqual(['Statistics', 'Algebra', 'Geometry'])
    })

    it("'accuracy-desc' sorts subjects by descending avg accuracy; null treated as -1 (bottom)", () => {
      // math practiced avg = (32 + 82) / 2 = 57 (null ignored — treated as -1, sorts last)
      // sci  practiced avg = 51 / 1 = 51 (null ignored)
      // → math first, sci second
      const out = groupTopicsBySubject<T, T>({ topics, subjects }, t => t, undefined, 'accuracy-desc')
      expect(out.map(g => g.subjectId)).toEqual(['math', 'sci'])
      // Within math: Geometry 82 → Algebra 32 → Statistics null (last)
      const math = out[0]!
      expect(math.rows.map(r => r.name)).toEqual(['Geometry', 'Algebra', 'Statistics'])
    })
  })

  describe('mapping + summary', () => {
    it('applies rowFor to each topic', () => {
      const out = groupTopicsBySubject<T, { id: string; tagged: boolean }>(
        { topics, subjects },
        t => ({ id: t.id, tagged: true }),
      )
      const allRows = out.flatMap(g => g.rows)
      expect(allRows.every(r => r.tagged === true)).toBe(true)
    })

    it('invokes summaryFor with mapped rows and raw topics', () => {
      let captured: { rows: unknown[]; raws: unknown[] } | null = null
      groupTopicsBySubject<T, { id: string }>(
        { topics, subjects },
        t => ({ id: t.id }),
        (rows, raws) => { captured = { rows, raws }; return `${rows.length} topics` },
      )
      expect(captured).not.toBeNull()
      expect(captured!.rows.length).toBeGreaterThan(0)
      expect(captured!.raws.length).toBeGreaterThan(0)
    })

    it('stores the returned summary on the group', () => {
      const out = groupTopicsBySubject<T, T>(
        { topics, subjects },
        t => t,
        (rows) => `${rows.length} topics`,
      )
      expect(out[0]!.summary).toMatch(/^\d+ topics$/)
    })

    it('summary is undefined when summaryFor not provided', () => {
      const out = groupTopicsBySubject<T, T>({ topics, subjects }, t => t)
      expect(out[0]!.summary).toBeUndefined()
    })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && npx jest utils/__tests__/groupTopicsBySubject.test.ts --no-coverage`
Expected: All tests FAIL with "Cannot find module '../groupTopicsBySubject'".

- [ ] **Step 3: Implement the helper**

Create `apps/mobile/utils/groupTopicsBySubject.ts`:

```ts
export type SortMode = 'accuracy-asc' | 'accuracy-desc' | 'alpha'

export interface SubjectGroup<T> {
  subjectId: string
  subjectName: string
  rows: T[]
  summary?: string
}

interface GroupInput<R extends { id: string; name: string; subjectId: string; accuracy?: number | null }> {
  topics: R[]
  subjects: Array<{ id: string; name: string }>
  focusListingSlugs?: string[]
  topicIdsByListingSlug?: Record<string, string[]>
}

/**
 * Pure helper: filter topics by focus list, group by subject, sort, map to caller's row type.
 * Drops subjects with no topics. See spec §4.2 for full behavior.
 */
export function groupTopicsBySubject<
  R extends { id: string; name: string; subjectId: string; accuracy?: number | null },
  T,
>(
  input: GroupInput<R>,
  rowFor: (topic: R) => T,
  summaryFor?: (rows: T[], rawTopics: R[]) => string,
  sort: SortMode = 'alpha',
): SubjectGroup<T>[] {
  const { topics, subjects, focusListingSlugs, topicIdsByListingSlug } = input

  // 1. Focus-list filter (only when both inputs present)
  let allowed: Set<string> | null = null
  if (focusListingSlugs && focusListingSlugs.length > 0 && topicIdsByListingSlug) {
    allowed = new Set<string>()
    for (const slug of focusListingSlugs) {
      const ids = topicIdsByListingSlug[slug] ?? []
      for (const id of ids) allowed.add(id)
    }
  }
  const filtered = allowed ? topics.filter(t => allowed!.has(t.id)) : topics

  // 2. Group by subjectId
  const buckets = new Map<string, R[]>()
  for (const t of filtered) {
    if (!buckets.has(t.subjectId)) buckets.set(t.subjectId, [])
    buckets.get(t.subjectId)!.push(t)
  }

  // 3. Build groups, looking up subject name from subjects array
  const subjectNameById = new Map(subjects.map(s => [s.id, s.name]))
  const groups: SubjectGroup<T>[] = []
  for (const [subjectId, raws] of buckets.entries()) {
    // 4. Sort topics inside this subject
    const sortedRaws = sortTopics(raws, sort)
    // 5. Map to caller's row type
    const rows = sortedRaws.map(rowFor)
    groups.push({
      subjectId,
      subjectName: subjectNameById.get(subjectId) ?? subjectId,
      rows,
      summary: summaryFor ? summaryFor(rows, sortedRaws) : undefined,
    })
  }

  // 6. Sort subjects
  return sortGroups(groups, buckets, sort)
}

function accuracyOf(t: { accuracy?: number | null }, sort: SortMode): number {
  if (t.accuracy != null) return t.accuracy
  // Null accuracy: 0 in asc (sorts to top — "study these next"), -1 in desc (sorts to bottom)
  return sort === 'accuracy-asc' ? 0 : -1
}

function sortTopics<R extends { name: string; accuracy?: number | null }>(rows: R[], sort: SortMode): R[] {
  const copy = [...rows]
  if (sort === 'alpha') {
    copy.sort((a, b) => a.name.localeCompare(b.name))
  } else if (sort === 'accuracy-asc') {
    copy.sort((a, b) => accuracyOf(a, sort) - accuracyOf(b, sort))
  } else {
    // accuracy-desc
    copy.sort((a, b) => accuracyOf(b, sort) - accuracyOf(a, sort))
  }
  return copy
}

function sortGroups<T>(
  groups: SubjectGroup<T>[],
  bucketsByName: Map<string, Array<{ accuracy?: number | null }>>,
  sort: SortMode,
): SubjectGroup<T>[] {
  const copy = [...groups]
  if (sort === 'alpha') {
    copy.sort((a, b) => a.subjectName.localeCompare(b.subjectName))
    return copy
  }
  // Compute avg accuracy per subject for the comparison
  const avgById = new Map<string, number>()
  for (const [id, raws] of bucketsByName.entries()) {
    let sum = 0
    let n = 0
    for (const r of raws) {
      sum += accuracyOf(r, sort)
      n++
    }
    avgById.set(id, n > 0 ? sum / n : 0)
  }
  if (sort === 'accuracy-asc') {
    copy.sort((a, b) => (avgById.get(a.subjectId) ?? 0) - (avgById.get(b.subjectId) ?? 0))
  } else {
    copy.sort((a, b) => (avgById.get(b.subjectId) ?? 0) - (avgById.get(a.subjectId) ?? 0))
  }
  return copy
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && npx jest utils/__tests__/groupTopicsBySubject.test.ts --no-coverage`
Expected: All tests PASS.

- [ ] **Step 5: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | grep groupTopicsBySubject`
Expected: no output (no type errors for these files).

- [ ] **Step 6: Commit**

```bash
cd "c:/Users/User/OneDrive/Desktop/IskotifyApp" && git add apps/mobile/utils/groupTopicsBySubject.ts apps/mobile/utils/__tests__/groupTopicsBySubject.test.ts && git commit -m "feat(mobile): add groupTopicsBySubject helper + tests"
```

---

### Task 2: `<SubjectAccordion>` component + tests

**Files:**
- Create: `apps/mobile/components/SubjectAccordion.tsx`
- Create: `apps/mobile/components/__tests__/SubjectAccordion.test.tsx`

- [ ] **Step 1: Write the failing tests**

Create `apps/mobile/components/__tests__/SubjectAccordion.test.tsx`:

```tsx
import React from 'react'
import { Text } from 'react-native'
import { render, fireEvent } from '@testing-library/react-native'
import { SubjectAccordion } from '../SubjectAccordion'
import type { SubjectGroup } from '../../utils/groupTopicsBySubject'

interface Row { id: string; label: string }

function makeGroups(): SubjectGroup<Row>[] {
  return [
    { subjectId: 'math', subjectName: 'Mathematics', summary: '3 topics · 50% avg', rows: [
      { id: 't1', label: 'Algebra' },
      { id: 't2', label: 'Geometry' },
      { id: 't3', label: 'Calculus' },
    ]},
    { subjectId: 'sci', subjectName: 'Science', summary: '2 topics · 70% avg', rows: [
      { id: 't4', label: 'Biology' },
      { id: 't5', label: 'Physics' },
    ]},
  ]
}

function renderRow(row: Row) {
  return <Text testID={`row-${row.id}`}>{row.label}</Text>
}

describe('SubjectAccordion', () => {
  it('renders emptyText when groups is empty', () => {
    const { getByText } = render(
      <SubjectAccordion groups={[]} renderRow={renderRow} emptyText="No subjects here" />
    )
    expect(getByText('No subjects here')).toBeTruthy()
  })

  it('renders each subject header with its name and summary', () => {
    const { getByText } = render(
      <SubjectAccordion groups={makeGroups()} renderRow={renderRow} />
    )
    expect(getByText('Mathematics')).toBeTruthy()
    expect(getByText('Science')).toBeTruthy()
    expect(getByText('3 topics · 50% avg')).toBeTruthy()
    expect(getByText('2 topics · 70% avg')).toBeTruthy()
  })

  it('initiallyExpanded="first" → only first subject\'s rows visible', () => {
    const { getByTestId, queryByTestId } = render(
      <SubjectAccordion groups={makeGroups()} renderRow={renderRow} initiallyExpanded="first" />
    )
    expect(getByTestId('row-t1')).toBeTruthy()    // Mathematics is first → expanded
    expect(queryByTestId('row-t4')).toBeNull()    // Science → collapsed
  })

  it('initiallyExpanded="all" → all rows visible', () => {
    const { getByTestId } = render(
      <SubjectAccordion groups={makeGroups()} renderRow={renderRow} initiallyExpanded="all" />
    )
    expect(getByTestId('row-t1')).toBeTruthy()
    expect(getByTestId('row-t4')).toBeTruthy()
  })

  it('initiallyExpanded="none" → no rows visible', () => {
    const { queryByTestId } = render(
      <SubjectAccordion groups={makeGroups()} renderRow={renderRow} initiallyExpanded="none" />
    )
    expect(queryByTestId('row-t1')).toBeNull()
    expect(queryByTestId('row-t4')).toBeNull()
  })

  it('tapping a collapsed header expands that subject', () => {
    const { getByTestId, queryByTestId, getByText } = render(
      <SubjectAccordion groups={makeGroups()} renderRow={renderRow} initiallyExpanded="none" />
    )
    expect(queryByTestId('row-t4')).toBeNull()
    fireEvent.press(getByText('Science'))
    expect(getByTestId('row-t4')).toBeTruthy()
  })

  it('tapping an expanded header collapses that subject', () => {
    const { queryByTestId, getByTestId, getByText } = render(
      <SubjectAccordion groups={makeGroups()} renderRow={renderRow} initiallyExpanded="all" />
    )
    expect(getByTestId('row-t1')).toBeTruthy()
    fireEvent.press(getByText('Mathematics'))
    expect(queryByTestId('row-t1')).toBeNull()
  })

  it("two subjects' expansion states are independent", () => {
    const { getByText, getByTestId, queryByTestId } = render(
      <SubjectAccordion groups={makeGroups()} renderRow={renderRow} initiallyExpanded="none" />
    )
    fireEvent.press(getByText('Mathematics'))
    expect(getByTestId('row-t1')).toBeTruthy()
    expect(queryByTestId('row-t4')).toBeNull()
    fireEvent.press(getByText('Science'))
    expect(getByTestId('row-t1')).toBeTruthy()
    expect(getByTestId('row-t4')).toBeTruthy()
  })

  it('renderRow is invoked once per row when its subject is expanded', () => {
    const spy = jest.fn(renderRow)
    render(
      <SubjectAccordion groups={makeGroups()} renderRow={spy} initiallyExpanded="all" />
    )
    expect(spy).toHaveBeenCalledTimes(5)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/mobile && npx jest components/__tests__/SubjectAccordion.test.tsx --no-coverage`
Expected: All tests FAIL with "Cannot find module '../SubjectAccordion'".

- [ ] **Step 3: Implement the component**

Create `apps/mobile/components/SubjectAccordion.tsx`:

```tsx
import React, { useState, useMemo } from 'react'
import { View, Text, Pressable, StyleSheet } from 'react-native'
import type { SubjectGroup } from '../utils/groupTopicsBySubject'

interface Props<T> {
  groups: SubjectGroup<T>[]
  emptyText?: string
  initiallyExpanded?: 'first' | 'all' | 'none'
  renderRow: (row: T) => React.ReactNode
}

export function SubjectAccordion<T>({
  groups,
  emptyText,
  initiallyExpanded = 'first',
  renderRow,
}: Props<T>): JSX.Element {
  const initial = useMemo<Record<string, boolean>>(() => {
    if (groups.length === 0) return {}
    if (initiallyExpanded === 'all') {
      return Object.fromEntries(groups.map(g => [g.subjectId, true]))
    }
    if (initiallyExpanded === 'none') {
      return Object.fromEntries(groups.map(g => [g.subjectId, false]))
    }
    // 'first'
    return Object.fromEntries(groups.map((g, i) => [g.subjectId, i === 0]))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups.map(g => g.subjectId).join('|'), initiallyExpanded])

  const [expanded, setExpanded] = useState<Record<string, boolean>>(initial)

  if (groups.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>{emptyText ?? 'Nothing to show'}</Text>
      </View>
    )
  }

  function toggle(subjectId: string) {
    setExpanded(prev => ({ ...prev, [subjectId]: !prev[subjectId] }))
  }

  return (
    <View>
      {groups.map(group => {
        const isOpen = !!expanded[group.subjectId]
        return (
          <View key={group.subjectId} style={styles.group}>
            <Pressable
              style={styles.header}
              onPress={() => toggle(group.subjectId)}
              accessibilityRole="button"
              accessibilityState={{ expanded: isOpen }}
            >
              <Text style={styles.chevron}>{isOpen ? '▼' : '▶'}</Text>
              <Text style={styles.name}>{group.subjectName}</Text>
              {group.summary ? <Text style={styles.summary}>{group.summary}</Text> : null}
            </Pressable>
            {isOpen ? (
              <View style={styles.body}>
                {group.rows.map((row, idx) => (
                  <View key={idx} style={styles.rowWrap}>
                    {renderRow(row)}
                  </View>
                ))}
              </View>
            ) : null}
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  emptyContainer: { paddingVertical: 24, paddingHorizontal: 16, alignItems: 'center' },
  emptyText: { color: '#666', fontSize: 14, textAlign: 'center' },
  group: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#e0e0e0' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  chevron: { fontSize: 12, color: '#666', width: 14 },
  name: { fontSize: 16, fontWeight: '700', color: '#111', flex: 1 },
  summary: { fontSize: 12, color: '#666' },
  body: { paddingLeft: 12, paddingBottom: 8 },
  rowWrap: { paddingHorizontal: 4 },
})
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/mobile && npx jest components/__tests__/SubjectAccordion.test.tsx --no-coverage`
Expected: All tests PASS.

- [ ] **Step 5: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | grep SubjectAccordion`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
cd "c:/Users/User/OneDrive/Desktop/IskotifyApp" && git add apps/mobile/components/SubjectAccordion.tsx apps/mobile/components/__tests__/SubjectAccordion.test.tsx && git commit -m "feat(mobile): add SubjectAccordion generic component + tests"
```

---

## Phase 2 — Data hook extension

### Task 3: Extend `useAnalytics.TopicMastery` with topicId + subjectId

**Files:**
- Modify: `apps/mobile/hooks/useAnalytics.ts`

This task is small (additive only — adds two optional fields and populates them). No new tests added; existing useAnalytics tests should still pass because the new fields are `optional`.

- [ ] **Step 1: Read the current file**

Run: `cat apps/mobile/hooks/useAnalytics.ts | head -130`

Locate:
- The `TopicMastery` interface (around line 13)
- The `topicMap` construction (around line 99)
- The `topicMastery` mapping that pushes `{ label, accuracy, sessionCount }` (around line 111)

- [ ] **Step 2: Extend the `TopicMastery` interface**

Find:
```ts
export interface TopicMastery {
  label: string
  accuracy: number
  sessionCount: number
}
```

Replace with:
```ts
export interface TopicMastery {
  label: string
  accuracy: number
  sessionCount: number
  // NEW: present for topic-backed entries, undefined for deck-backed entries.
  // The Subject accordion uses these to group by subject; deck entries are excluded.
  topicId?: string
  subjectId?: string
}
```

- [ ] **Step 3: Extend `topicMap` to carry subjectId**

Find:
```ts
const topicMap = new Map(topicRows.map(t => [t.id, t.name]))
```

Replace with:
```ts
const topicMap = new Map(topicRows.map(t => [t.id, { name: t.name, subjectId: t.subjectId }]))
```

(`topicRows` already includes `subjectId` because the `topics` table in `db/schema.ts` has a `subject_id` column.)

- [ ] **Step 4: Populate the new fields in the `topicMastery` mapping**

Find the existing mapping block:
```ts
const topicMastery: TopicMastery[] = Object.entries(grouped)
  .filter(([, v]) => v.total > 0)
  .map(([key, v]) => ({
    label: topicMap.get(key) ?? deckMap.get(key) ?? resolveTopicLabel(key, new Map()),
    accuracy: Math.round((v.score / v.total) * 100),
    sessionCount: v.count,
  }))
```

Replace with:
```ts
const topicMastery: TopicMastery[] = Object.entries(grouped)
  .filter(([, v]) => v.total > 0)
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

- [ ] **Step 5: Run existing useAnalytics tests to verify no regression**

Run: `cd apps/mobile && npx jest hooks/__tests__/useAnalytics.test.ts --no-coverage 2>&1 | tail -10`
Expected: same pass count as before this task (the two new fields are optional; existing consumers reading `label`/`accuracy`/`sessionCount` are unaffected).

- [ ] **Step 6: Type-check the change**

Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | grep -E "useAnalytics|TopicMastery"`
Expected: no output. (Pre-existing errors in unrelated files like `backfill/__tests__` etc. are not this task's responsibility.)

- [ ] **Step 7: Commit**

```bash
cd "c:/Users/User/OneDrive/Desktop/IskotifyApp" && git add apps/mobile/hooks/useAnalytics.ts && git commit -m "feat(mobile/analytics): extend TopicMastery with optional topicId + subjectId for subject grouping"
```

---

## Phase 3 — Tab wirings

### Task 4: Wire `<SubjectAccordion>` into Practice tab

**Files:**
- Modify: `apps/mobile/app/(tabs)/practice.tsx`

- [ ] **Step 1: Read the current Practice tab to find the "All Topics" section**

Run: `grep -n "All Topics\|TopicCard\|FlatList" apps/mobile/app/(tabs)/practice.tsx | head -20`

Locate:
- Imports section (top of file)
- The `<SectionTitle>All Topics</SectionTitle>` block + the FlatList of TopicCard immediately below it (this is what we replace)
- Where `topicRows`, `allSubjects`, `focusListingsList`, `topicIdsByListingSlug` are in scope (from `usePracticeData()` and `useFocusListings()` hooks)

- [ ] **Step 2: Add imports**

Add at the top of `practice.tsx` (alongside existing imports):

```ts
import { useMemo } from 'react'  // if not already imported — check first
import { groupTopicsBySubject } from '../../utils/groupTopicsBySubject'
import { SubjectAccordion } from '../../components/SubjectAccordion'
```

(If `useMemo` is already imported, skip that line. If `useMemo` is needed in addition to an existing `useState`/`useEffect` import, combine into one `import { useState, useEffect, useMemo } from 'react'`.)

- [ ] **Step 3: Compute the grouped subject data**

Inside the component, after the data hooks fire (where `topicRows`, `allSubjects`, `focusListingsList`, `topicIdsByListingSlug` are accessible), add this memoized derivation:

```tsx
const subjectGroups = useMemo(() => {
  function avgAccuracy(items: Array<{ accuracy?: number | null }>): number {
    const practiced = items.filter(i => i.accuracy != null) as Array<{ accuracy: number }>
    if (practiced.length === 0) return 0
    return Math.round(practiced.reduce((s, i) => s + i.accuracy, 0) / practiced.length)
  }
  return groupTopicsBySubject(
    {
      topics: topicRows.map(r => ({
        id: r.topic.id,
        name: r.topic.name,
        subjectId: r.topic.subjectId,
        accuracy: r.accuracy,
        cardCount: r.cardCount,
        strength: r.strength,
        lastPracticedAt: r.lastPracticedAt,
        topic: r.topic,  // preserved so the existing TopicCard component receives the full row
      })),
      subjects: allSubjects,
      focusListingSlugs: focusListingsList.map(l => l.slug),
      topicIdsByListingSlug,
    },
    (topic) => topic,
    (rows, raws) => {
      const allNew = raws.every(r => r.accuracy == null)
      return allNew ? `${rows.length} topics · New` : `${rows.length} topics · ${avgAccuracy(rows)}% avg`
    },
    'accuracy-asc',
  )
}, [topicRows, allSubjects, focusListingsList, topicIdsByListingSlug])
```

- [ ] **Step 4: Replace the "All Topics" section with the accordion**

Locate the existing section JSX. It looks something like:

```tsx
<SectionTitle>All Topics</SectionTitle>
<FlatList
  data={topicRows}
  keyExtractor={item => item.topic.id}
  renderItem={({ item }) => <TopicCard {...item} />}
  // ...
/>
```

Replace with:

```tsx
<SectionTitle>Subjects</SectionTitle>
{focusListingsList.length > 0 ? (
  <Text style={{ paddingHorizontal: 16, paddingBottom: 4, fontSize: 11, color: '#666' }}>
    focus: {focusListingsList.map(l => l.slug).join(', ')}
  </Text>
) : null}
<SubjectAccordion
  groups={subjectGroups}
  emptyText={
    focusListingsList.length > 0
      ? "Your focus list doesn't have topics yet — they'll appear here after sync"
      : 'No topics yet'
  }
  initiallyExpanded="first"
  renderRow={(row) => <TopicCard {...row} />}
/>
```

(If the existing SectionTitle component takes children differently or if there's no `SectionTitle` and the heading is just a `<Text>`, match the file's actual style. Read 1-2 surrounding sections in the same file to mimic the heading pattern exactly.)

- [ ] **Step 5: Type-check + run any practice-tab tests**

Run:
```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | grep -E "practice\.tsx"
cd apps/mobile && npx jest app/\\(tabs\\)/__tests__/practice.test.tsx --no-coverage 2>&1 | tail -10
```
Expected: zero new TS errors. Existing practice tests pass unchanged (the accordion is a drop-in for the flat list; smoke tests querying for TopicCard should still find the rendered TopicCards because the accordion expands the first subject by default).

If existing tests assert on FlatList specifically (`getByA11yRole('list')` etc.), they may need updating. Adjust those tests to find the new accordion (`getByText('Subjects')` then expand subjects as needed). Keep test intent the same — verify TopicCard is rendered with expected props for the first topic in the first subject.

- [ ] **Step 6: Full mobile suite to confirm baseline**

Run: `cd apps/mobile && npx jest --no-coverage 2>&1 | tail -5`
Expected: 14 failures (baseline) or fewer. Do not introduce new failures.

- [ ] **Step 7: Commit**

```bash
cd "c:/Users/User/OneDrive/Desktop/IskotifyApp" && git add apps/mobile/app/\(tabs\)/practice.tsx && git commit -m "feat(mobile/practice): replace All Topics flat list with SubjectAccordion (focus-scoped, weakest-first)"
```

---

### Task 5: Wire `<SubjectAccordion>` into Analytics tab

**Files:**
- Modify: `apps/mobile/app/(tabs)/analytics.tsx`

- [ ] **Step 1: Read the current Analytics tab to find the "Topic Mastery" section**

Run: `grep -n "Topic Mastery\|topicMastery" apps/mobile/app/(tabs)/analytics.tsx | head -20`

Locate:
- The "Topic Mastery" section title + the flat list of topics with horizontal accuracy bars
- Where `topicMastery` (from `useAnalytics(slug)`) is in scope
- The existing inline JSX for a single topic-mastery row (name + bar + accuracy%)

- [ ] **Step 2: Add imports**

Add at the top of `analytics.tsx`:

```ts
import { useMemo } from 'react'  // if not already imported
import { groupTopicsBySubject } from '../../utils/groupTopicsBySubject'
import { SubjectAccordion } from '../../components/SubjectAccordion'
```

- [ ] **Step 3: Compute the grouped subject data**

Inside the component, after `useAnalytics(slug)` returns, add:

```tsx
const subjectGroups = useMemo(() => {
  function avgAccuracy(items: Array<{ accuracy?: number | null }>): number {
    const practiced = items.filter(i => i.accuracy != null) as Array<{ accuracy: number }>
    if (practiced.length === 0) return 0
    return Math.round(practiced.reduce((s, i) => s + i.accuracy, 0) / practiced.length)
  }
  // Mastery accordion shows only topic-backed entries with practice data.
  // Deck entries (topicId undefined) are filtered out; they remain in Recent Sessions.
  const topicEntries = topicMastery.filter(t => t.topicId != null && t.subjectId != null)
  return groupTopicsBySubject(
    {
      topics: topicEntries.map(t => ({
        id: t.topicId as string,
        name: t.label,
        subjectId: t.subjectId as string,
        accuracy: t.accuracy,
        sessionCount: t.sessionCount,
      })),
      subjects: allSubjects,
      // No focus filter — listing-tab UI already scopes the data
    },
    (topic) => topic,
    (rows) => `${rows.length} topics · ${avgAccuracy(rows)}% avg`,
    'accuracy-desc',
  )
}, [topicMastery, allSubjects])
```

(`allSubjects` should come from a hook like `usePracticeData()` or you may need to call `useDb()` and query the `subjects` table directly. Look at how other analytics-screen code resolves subject names. If there's no current accessor, add a small inline query: `db.select().from(subjects)` inside a `useEffect` that sets local state. Don't invent a new hook for this — keep it inline.)

- [ ] **Step 4: Replace the "Topic Mastery" section with the accordion**

Find the existing section JSX. It looks something like:

```tsx
<Text style={styles.sectionTitle}>Topic Mastery</Text>
{topicMastery.map(t => (
  <View key={t.label}>
    <Text>{t.label}</Text>
    <View style={styles.barWrap}>
      <View style={[styles.bar, { width: `${t.accuracy}%`, backgroundColor: colorFor(t.accuracy) }]} />
    </View>
    <Text>{t.accuracy}%</Text>
  </View>
))}
```

Replace with:

```tsx
<Text style={styles.sectionTitle}>Subject Mastery</Text>
<Text style={{ paddingHorizontal: 16, paddingBottom: 4, fontSize: 11, color: '#666' }}>
  scope: {slug === 'overall' ? 'Overall' : (focusListingsList.find(l => l.slug === slug)?.title ?? slug)}
</Text>
<SubjectAccordion
  groups={subjectGroups}
  emptyText="Start practicing to see mastery analytics"
  initiallyExpanded="first"
  renderRow={(row) => (
    <View style={styles.masteryRow}>
      <Text style={styles.masteryLabel}>{row.name}</Text>
      <View style={styles.barWrap}>
        <View style={[styles.bar, { width: `${row.accuracy}%`, backgroundColor: colorFor(row.accuracy) }]} />
      </View>
      <Text style={styles.masteryPercent}>{row.accuracy}%</Text>
    </View>
  )}
/>
```

The inline row JSX inside `renderRow` reuses the existing topic-mastery row styles (`styles.barWrap`, `styles.bar`, `colorFor`) from the same file. If the helper function `colorFor` or the style keys have different names in the actual file, adapt to match — the goal is to render an identical-looking row, just inside the accordion's expanded body.

- [ ] **Step 5: Type-check + run any analytics-tab tests**

Run:
```bash
cd apps/mobile && npx tsc --noEmit 2>&1 | grep -E "analytics\.tsx"
cd apps/mobile && npx jest app/\\(tabs\\)/__tests__/analytics.test.tsx --no-coverage 2>&1 | tail -10
```
Expected: zero new TS errors. Existing analytics tests pass unchanged.

If existing tests assert on flat-list rendering of topic-mastery rows, they may need updating to expand the relevant subject first. Same approach as Task 4 — keep test intent, adjust queries.

- [ ] **Step 6: Full mobile suite to confirm baseline**

Run: `cd apps/mobile && npx jest --no-coverage 2>&1 | tail -5`
Expected: 14 failures (baseline) or fewer.

- [ ] **Step 7: Commit**

```bash
cd "c:/Users/User/OneDrive/Desktop/IskotifyApp" && git add apps/mobile/app/\(tabs\)/analytics.tsx && git commit -m "feat(mobile/analytics): replace Topic Mastery flat list with SubjectAccordion (strongest-first, decks filtered)"
```

---

## Phase 4 — Rollout

### Task 6: Push mobile OTA + device verification

This task is operator-driven — it requires `eas update` CLI access and a physical device for verification. Treat as a checklist.

- [ ] **Step 1: Push the OTA**

Run:
```bash
cd apps/mobile
npx eas update --channel preview \
  --message "feat(mobile): Subject accordion replaces flat topic lists in Practice + Analytics"
```

Record the Update group ID from the output for rollback.

- [ ] **Step 2: Wait for build + upload to complete**

EAS typically takes 30–90 seconds. The command prints `Published!` with the new Update group ID when done.

- [ ] **Step 3: Force-close + reopen the mobile app twice**

Expo OTA quirk: the first launch downloads the new bundle in the background, the second launch actually runs it.

- [ ] **Step 4: Verify Practice tab on device**

Open Practice tab. Confirm:
- Section title is "SUBJECTS" (was "ALL TOPICS")
- Subjects appear as collapsible sections; the weakest subject (lowest avg accuracy) is expanded by default
- Each subject header shows `{N} topics · {avg}% avg` (or `{N} topics · New` if all topics are unpracticed)
- Tapping a collapsed subject header reveals its topics
- Tapping an expanded subject header collapses it
- Tapping a topic still navigates to `/practice/[topicId]` (unchanged)
- If you have a focus list set: only subjects/topics linked to those listings appear
- If you clear your focus list: all subjects appear
- Other sections (Banner, My Focus, Quick Start, Recommended, Saved Decks) are visually unchanged

- [ ] **Step 5: Verify Analytics tab on device**

Open Analytics tab. Confirm:
- Section title is "SUBJECT MASTERY" (was "TOPIC MASTERY")
- Subjects appear as collapsible sections; the strongest subject (highest avg accuracy) is expanded by default
- Each subject header shows `{N} topics · {avg}% avg`
- Topic rows inside an expanded subject show name + horizontal accuracy bar + accuracy%
- Switching listing tabs (Overall / UPCAT / etc.) re-groups the accordion
- Decks (custom user-created decks) do NOT appear in the accordion (they're in Recent Sessions below)
- Topics you've never practiced do NOT appear in the accordion (Mastery shows only practiced topics)
- Other sections (Header, listing tabs, stats grid, weekly chart, Recent Sessions) are visually unchanged

- [ ] **Step 6: Record any visual issues**

Take screenshots of anything that looks off. Common things to check:
- Empty state when focus list is set but no topics yet
- Subject header padding / chevron alignment
- Long subject names truncating gracefully
- Performance with 5+ subjects expanded simultaneously

If everything looks good, the rollout is complete. If issues are found, file them as follow-up tasks (this plan does not iterate after deployment).

---

## Self-Review

### Spec coverage check

| Spec section | Implemented by |
|---|---|
| §1 Context (background) | n/a (context) |
| §2 Goals / Non-goals | Implicit in tasks below |
| §3 Architecture (helper + component + hook ext) | Task 1, Task 2, Task 3 |
| §4.1 SubjectAccordion props | Task 2 step 3 |
| §4.2 groupTopicsBySubject helper | Task 1 step 3 |
| §5.1 Practice replacement target | Task 4 step 4 |
| §5.2 Practice rendered shape | Task 4 step 4 |
| §5.3 Practice behaviors (sort, expansion, summary, empty states) | Task 4 step 3 + step 4 |
| §5.4 Practice wiring sketch | Task 4 step 3 |
| §5.5 Practice empty states | Task 4 step 4 (emptyText prop branches) |
| §6.1 Analytics replacement target | Task 5 step 4 |
| §6.2 Analytics rendered shape | Task 5 step 4 |
| §6.3 Analytics behaviors (sort, expansion, deck filter) | Task 5 step 3 + step 4 |
| §6.4 Analytics listing-tab interaction | Inherited — no change to listing-tab UI in this plan |
| §6.5 No focus-list filter in Analytics | Task 5 step 3 (no focusListingSlugs passed) |
| §6.6 Required useAnalytics extension | Task 3 |
| §6.7 Analytics wiring sketch | Task 5 step 3 |
| §6.8 Analytics empty states | Task 5 step 4 (emptyText prop) |
| §7 Testing strategy | Tasks 1, 2 (TDD); Tasks 4, 5 (smoke via existing tests) |
| §8 Rollout | Task 6 |
| §9 Risks/mitigations | Mostly mitigations are inherent to the design; nothing new to "implement" |
| Appendix A file list | Tasks 1-5 cover every file |

**Coverage complete.** Every spec section maps to at least one task.

### Placeholder scan

Searched the plan for: TBD, TODO, "implement later", "fill in details", "Similar to Task N", "add appropriate error handling", "handle edge cases":

- Task 4 step 4 contains "If the existing SectionTitle component takes children differently…" — this is acceptable because the plan can't know the exact JSX shape of the existing section header; it directs the engineer to mimic the surrounding style. Same pattern in Task 5 step 4 for the inline row JSX.
- Task 5 step 3 mentions `allSubjects` may need an inline DB query if it's not already in scope — this is acceptable because the analytics file may or may not already have it, and the engineer can determine quickly by reading the file.
- No "TBD" / "TODO" found. All code examples are complete and runnable.

### Type consistency check

- `SubjectGroup<T>` defined in Task 1 step 3 → used by Task 2 step 3 (component props) → used by Tasks 4 + 5 (callers). Consistent shape: `{ subjectId, subjectName, rows, summary? }`.
- `SortMode` defined in Task 1 step 3 → used by callers in Tasks 4 + 5 as positional fourth arg: `'accuracy-asc'` and `'accuracy-desc'`. Consistent.
- `TopicMastery` extension in Task 3 → consumed by Task 5 step 3 (which reads `t.topicId` and `t.subjectId` and narrows to non-null via the filter). Consistent.
- `groupTopicsBySubject` signature uses generics `<R, T>` — Task 1 establishes them, Tasks 4 + 5 invoke with concrete types. Consistent.

No inconsistencies found.

---

## Execution choice

Plan complete and saved to `docs/superpowers/plans/2026-05-30-practice-analytics-subject-accordion.md`. **Two execution options:**

1. **Subagent-Driven (recommended)** — Dispatch a fresh subagent per task, two-stage review (spec compliance, then code quality) between tasks, fast iteration. Best fit for this 6-task plan because each task is self-contained.

2. **Inline Execution** — Execute tasks in this session using `executing-plans`, batch execution with checkpoints. Lower overhead per task but my context window fills faster.

**Which approach?**
