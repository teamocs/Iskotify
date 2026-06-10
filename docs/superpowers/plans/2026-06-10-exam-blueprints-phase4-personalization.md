# Exam Blueprints — Phase 4 (Personalization & Launch Points) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans + superpowers:test-driven-development for the pure helpers. Steps use checkbox (`- [ ]`) syntax. This is **mobile RN, JS-only → OTA-deliverable** (NO `app.json` version bump — no native modules change). Per repo rule: I cannot render RN here, so pure logic is unit-tested with Jest; screen wiring is type-checked + react-doctored and flagged for **on-device verification** by the user.

**Goal:** Make the generic blueprint exam engine personal and discoverable:
1. **Course-note filtering** — on the exam pre-start, show only the course cut-off notes relevant to the student's target courses (matched by `career_courses.cluster`), plus universal (`all`) notes.
2. **Launch points** — exam listings that have a published blueprint get a "📝 Take Mock Exam" CTA on the listing detail screen (and a "Mock exam" badge on the Exams tab card).
3. **Percentile bands on results** — the results screen shows an honest *estimated* percentile band, and cross-references the student's filtered course cut-offs (✓ on track / ✗ below).

**Tech Stack:** Expo RN, Drizzle/expo-sqlite, Jest (services project, real-SQLite). Theme tokens (`theme/tokens.ts`, `useTheme`). NativeWind is removed — use `StyleSheet.create` only.

**Reference spec:** `docs/superpowers/specs/2026-06-10-exam-blueprints-design.md`.

**Data-model facts (verified):**
- `exam_course_notes.course_cluster` = a `career_courses.cluster` name (e.g. `Health Sciences`, `Engineering`) **or** `all`. Seed has both kinds (`supabase/migrations/032`).
- A student's target courses live in `user_settings.target_courses` as JSON `CourseOption[]` = `{ id, label, careerCourseId }` (`utils/targetExams.ts:142`). `careerCourseId` joins `career_courses.course_id` → `cluster` (`db/schema.ts:262-265`).
- `getExamBlueprint()` already returns `courseNotes: { courseCluster, note, minPercentile }[]` (`services/examBlueprints.ts:35`). `listPublishedBlueprintSlugs(db)` already exists (`:40`).
- Blueprint slug == listing slug for exams (e.g. `upcat`, `ustet`, `dcat-dlsu`, `wvsu-cat`).
- Exam screen pre-start renders all course notes at `app/practice/exam/[slug].tsx:241-251`; results at `:266-341`. Listing detail's exam CTA is at `app/listings/[slug].tsx:587-595`.

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `apps/mobile/utils/examBuilder.ts` | Add pure `filterCourseNotesByClusters()` + `estimatePercentileBand()` | Modify |
| `apps/mobile/utils/__tests__/examBuilder.test.ts` | Tests for the two new pure helpers | Modify (append) |
| `apps/mobile/services/examBlueprints.ts` | Add `getTargetCourseClusters(db)` | Modify |
| `apps/mobile/services/__tests__/examBlueprints.test.ts` | Test cluster resolution (real-SQLite) | Modify (append) |
| `apps/mobile/app/practice/exam/[slug].tsx` | Filter notes on pre-start; percentile band + cut-off check on results | Modify |
| `apps/mobile/app/listings/[slug].tsx` | "📝 Take Mock Exam" CTA when slug has a published blueprint | Modify |
| `apps/mobile/components/listings/*` (the Exams-tab card) | "Mock exam" badge — **only if the card is a simple shared component** | Modify (optional) |

---

### Task 1: Pure helpers (`filterCourseNotesByClusters`, `estimatePercentileBand`)

TDD. These are pure and fully unit-testable.

**Files:**
- Modify: `apps/mobile/utils/examBuilder.ts`
- Test: `apps/mobile/utils/__tests__/examBuilder.test.ts`

- [ ] **Step 1: Write failing tests** (append; import the new symbols)

```ts
import { filterCourseNotesByClusters, estimatePercentileBand } from '../examBuilder'

describe('filterCourseNotesByClusters', () => {
  const notes = [
    { courseCluster: 'all', note: 'A', minPercentile: null },
    { courseCluster: 'Health Sciences', note: 'B', minPercentile: 90 },
    { courseCluster: 'Engineering', note: 'C', minPercentile: 90 },
  ]
  it('returns ALL notes when the student has no target clusters', () => {
    expect(filterCourseNotesByClusters(notes, [])).toEqual(notes)
  })
  it('keeps "all" notes plus notes matching the student clusters', () => {
    const out = filterCourseNotesByClusters(notes, ['Health Sciences'])
    expect(out.map(n => n.note)).toEqual(['A', 'B'])
  })
  it('keeps only "all" when no cluster matches', () => {
    const out = filterCourseNotesByClusters(notes, ['Law'])
    expect(out.map(n => n.note)).toEqual(['A'])
  })
  it('is case-insensitive on cluster names', () => {
    const out = filterCourseNotesByClusters(notes, ['health sciences'])
    expect(out.map(n => n.note)).toEqual(['A', 'B'])
  })
})

describe('estimatePercentileBand', () => {
  it('clamps and labels tiers', () => {
    expect(estimatePercentileBand(95).band).toBe('Top tier')
    expect(estimatePercentileBand(80).band).toBe('Competitive')
    expect(estimatePercentileBand(60).band).toBe('Developing')
    expect(estimatePercentileBand(20).band).toBe('Foundational')
  })
  it('returns a percentile equal to the clamped raw pct', () => {
    expect(estimatePercentileBand(73).percentile).toBe(73)
    expect(estimatePercentileBand(150).percentile).toBe(99)
    expect(estimatePercentileBand(-5).percentile).toBe(1)
  })
})
```

- [ ] **Step 2: Run → fail.** `cd apps/mobile && npx jest --selectProjects services -t 'filterCourseNotesByClusters|estimatePercentileBand'` (examBuilder test lives under the services project per `jest.config.js` testMatch — confirm; if it's under `mobile` project, drop the `--selectProjects` filter). Expect FAIL (symbols undefined).

- [ ] **Step 3: Implement** in `apps/mobile/utils/examBuilder.ts`:

```ts
export interface CourseNote { courseCluster: string; note: string; minPercentile: number | null }

/** Keep universal ("all") notes plus any whose cluster the student is targeting.
 *  Empty clusters (student set no target courses) → return all notes unfiltered. */
export function filterCourseNotesByClusters<T extends { courseCluster: string }>(notes: T[], clusters: string[]): T[] {
  if (clusters.length === 0) return notes
  const set = new Set(clusters.map(c => c.trim().toLowerCase()))
  return notes.filter(n => {
    const c = n.courseCluster.trim().toLowerCase()
    return c === 'all' || set.has(c)
  })
}

export interface PercentileBand { percentile: number; band: string; blurb: string }

/** Honest, distribution-free estimate: percentile ≈ raw % correct, clamped to [1,99].
 *  Labelled "estimated" in the UI — NOT a normed score. */
export function estimatePercentileBand(pct: number): PercentileBand {
  const percentile = Math.max(1, Math.min(99, Math.round(pct)))
  let band: string, blurb: string
  if (percentile >= 90) { band = 'Top tier'; blurb = 'On track for the most selective programs.' }
  else if (percentile >= 75) { band = 'Competitive'; blurb = 'Strong — competitive for many programs.' }
  else if (percentile >= 50) { band = 'Developing'; blurb = 'Building up — keep drilling weak sections.' }
  else { band = 'Foundational'; blurb = 'Focus on fundamentals before timed mocks.' }
  return { percentile, band, blurb }
}
```

- [ ] **Step 4: Run → pass.** Same command. Expect PASS.

- [ ] **Step 5: Commit** `feat(mobile): pure course-note filter + estimated percentile band helpers`.

---

### Task 2: `getTargetCourseClusters(db)` service

**Files:**
- Modify: `apps/mobile/services/examBlueprints.ts`
- Test: `apps/mobile/services/__tests__/examBlueprints.test.ts`

- [ ] **Step 1: Write failing test** (append; follow the existing real-SQLite pattern in that file — seed `user_settings` + `career_courses` via the shared CREATE_SQL/MIGRATIONS harness).

Test cases:
- `user_settings.target_courses` = `[{id,label,careerCourseId:'cc-nur'}]` and `career_courses` has `cc-nur → cluster 'Health Sciences'` → `getTargetCourseClusters` returns `['Health Sciences']`.
- empty/absent target_courses → returns `[]`.
- a target course whose `careerCourseId` is null or unmatched → skipped (no crash), distinct clusters only.

- [ ] **Step 2: Run → fail.**

- [ ] **Step 3: Implement** in `services/examBlueprints.ts`:

```ts
import { userSettings, careerCourses } from '../db/schema'  // extend existing import line

/** Resolve the student's target courses → the distinct career_courses.cluster names,
 *  used to filter a blueprint's course-cut-off notes. Empty array if none set. */
export async function getTargetCourseClusters(db: DrizzleClient): Promise<string[]> {
  const rows = await db.select({ tc: userSettings.targetCourses }).from(userSettings).where(eq(userSettings.id, 1)).limit(1)
  let parsed: { careerCourseId?: string | null }[] = []
  try { const v = JSON.parse(rows[0]?.tc ?? '[]'); if (Array.isArray(v)) parsed = v } catch { /* ignore */ }
  const ids = parsed.map(c => c?.careerCourseId).filter((x): x is string => !!x)
  if (ids.length === 0) return []
  const ccRows = await db.select({ cluster: careerCourses.cluster }).from(careerCourses).where(inArray(careerCourses.courseId, ids))
  const clusters = new Set<string>()
  for (const r of ccRows) if (r.cluster) clusters.add(r.cluster)
  return Array.from(clusters)
}
```
(`eq`, `inArray` are already imported in this file.)

- [ ] **Step 4: Run → pass.**

- [ ] **Step 5: Commit** `feat(mobile): getTargetCourseClusters resolves target courses to career clusters`.

---

### Task 3: Wire personalization into the exam screen

**File:** Modify `apps/mobile/app/practice/exam/[slug].tsx`. **UI — needs on-device verification.**

- [ ] **Step 1: Load clusters + filter notes.**
  - Import `getTargetCourseClusters` and `filterCourseNotesByClusters`, `estimatePercentileBand`.
  - Add state `const [courseClusters, setCourseClusters] = useState<string[]>([])`.
  - In the load `useEffect` (the `Promise.all` at `:82`), also call `getTargetCourseClusters(db)` and `setCourseClusters(...)`. (Add it to the Promise.all so it's parallel.)
  - Compute `const visibleNotes = useMemo(() => blueprint ? filterCourseNotesByClusters(blueprint.courseNotes, courseClusters) : [], [blueprint, courseClusters])`.

- [ ] **Step 2: Pre-start render.** Replace the `blueprint.courseNotes.length ? (...)` block (`:241-251`) to use `visibleNotes`. When `courseClusters.length > 0` and the list was narrowed, change the section label from `Course cut-offs` to `Cut-offs for your courses`. Keep the existing card styling (`s.courseNote`, `s.courseCluster`, `s.courseNoteTxt`).

- [ ] **Step 3: Results render — percentile band.** In the `phase === 'results'` block (after the score card `:292`), add a band card:
  - `const pb = estimatePercentileBand(pct)`.
  - Render a card: big `~{pb.percentile}th` (prefix "est."), `pb.band`, `pb.blurb`. Add styles `s.bandCard`, `s.bandPct`, `s.bandLabel`, `s.bandBlurb` (mirror `s.scoreCard`/`s.metaCard` token styling). **Must read "Estimated percentile (not a normed score)"** somewhere on the card to stay honest.

- [ ] **Step 4: Results render — course cut-off check.** After the per-section block, if `visibleNotes` has any note with `minPercentile != null`, render a "Course cut-offs" section: for each such note show the cluster + note + a verdict pill comparing `pb.percentile` to `minPercentile`: `pb.percentile >= minPercentile ? '✓ On track (est.)' : 'Below cut-off (need ' + minPercentile + 'th)'`. Notes with `minPercentile == null` render without a verdict pill. Reuse `s.courseNote` styles + a small pill style.

- [ ] **Step 5: Verify.** `cd apps/mobile && npx tsc --noEmit 2>&1 | grep "practice/exam"` → empty. Run react-doctor on the file (see Task 6). **Flag to user: verify pre-start notes + results band render on device.**

- [ ] **Step 6: Commit** `feat(mobile): personalize exam course notes + estimated percentile on results`.

---

### Task 4: "Take Mock Exam" launch point on listing detail

**File:** Modify `apps/mobile/app/listings/[slug].tsx`. **UI — needs on-device verification.**

- [ ] **Step 1:** Import `listPublishedBlueprintSlugs` from `../../services/examBlueprints`. Add state `const [hasBlueprint, setHasBlueprint] = useState(false)`.
- [ ] **Step 2:** In the `load()` effect, after listing loads, call `listPublishedBlueprintSlugs(db)` and set `hasBlueprint(slugs.includes(slug))`. (Add to the existing `Promise.all` or a follow-up await — keep it from blocking the listing render; a separate `.then` is fine.)
- [ ] **Step 3:** In the exam CTA area (`:587-595`), when `isExam && hasBlueprint`, render a **primary** "📝 Take Mock Exam" button (reuse `AppButton` or `s.focusAddBtn` styling) that does `router.push(\`/practice/exam/${slug}\`)`, placed **above** the existing "⚡ Start Practicing for this Exam" button. Keep the generic practice button as the secondary. When `!hasBlueprint`, behavior is unchanged.
- [ ] **Step 4: Verify.** `npx tsc --noEmit 2>&1 | grep "listings/\[slug\]"` → empty. react-doctor the file. **Flag to user: verify the CTA shows only for exams with a published blueprint (e.g. open the UPCAT listing).**
- [ ] **Step 5: Commit** `feat(mobile): Take Mock Exam CTA on exam listings with a blueprint`.

---

### Task 5 (optional): "Mock exam" badge on the Exams-tab card

Only do this if the Exams tab renders cards via a **single shared component** that already receives the listing slug + a published-blueprint set can be threaded without a per-row DB call. Inspect `app/(tabs)/listings.tsx` first.
- [ ] If feasible: compute the published-blueprint slug set once in the Exams screen, pass down, and render a small "📝 Mock" badge on cards whose slug is in the set. Commit `feat(mobile): mock-exam badge on exam cards`.
- [ ] If it would require per-card DB calls or touching many files: **skip and note it** — the listing-detail CTA (Task 4) + the `/practice/exam` index already cover discovery. Do NOT force it.

---

### Task 6: QA + verification + OTA

- [ ] **Step 1: react-doctor** on changed RN files (repo QA rule). Fix any NEW bug-level findings — especially bare-zero `{count && <JSX/>}` (use `count > 0 ? ... : null` or `length ? ... : null`, which the existing code already does). Pre-existing ~842 issues are out of scope.
- [ ] **Step 2: Full mobile tests.** `cd apps/mobile && npx jest 2>&1 | tail -8` → all pass (expect prior count + new tests).
- [ ] **Step 3: tsc.** `cd apps/mobile && npx tsc --noEmit 2>&1 | tail -20` → no NEW errors in the changed files.
- [ ] **Step 4: NO app.json version bump** — JS-only change, OTA-deliverable on the appVersion runtime policy.
- [ ] **Step 5: Push + OTA** (controller does this after review): `git push origin master` then `cd apps/mobile && eas update --branch production --message "Phase 4: exam personalization + launch points"`. Capture the OTA update ID.

---

## Self-Review

**Spec coverage:**
- Filter course notes by target courses → Task 1 (pure) + Task 2 (cluster resolution) + Task 3 Step 2. ✓
- Launch points on Exams/listing detail → Task 4 (detail CTA) + Task 5 (optional card badge). ✓
- Percentile bands on results → Task 1 (`estimatePercentileBand`) + Task 3 Steps 3-4 (band card + cut-off check). ✓

**Honesty guardrail:** the percentile is an *estimate* (≈ raw %), not a normed score — every surface that shows it must say "estimated". This is called out in Task 1's helper doc and Task 3 Step 3. We do NOT have a real norming distribution; inventing one would be dishonest. Flagged so the reviewer enforces the label.

**Decisions:**
- No target courses → show ALL notes (preserves current behavior; never hide everything). ✓
- Cluster match is case-insensitive (seed uses Title Case; defensive). ✓
- Blueprint slug == listing slug assumption: `listPublishedBlueprintSlugs` returns the slugs; we just check membership, so if a listing has no matching blueprint the CTA simply doesn't show — safe. ✓

**Constraints honored:** JS-only → no version bump; NativeWind not used; pure logic unit-tested; UI flagged for on-device verification (can't render RN here); commits per task, controller pushes + OTAs after review.
