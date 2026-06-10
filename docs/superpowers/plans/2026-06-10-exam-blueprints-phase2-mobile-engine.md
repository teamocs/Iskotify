# Exam Blueprints — Phase 2 (Mobile Generic Engine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Turn the seeded exam blueprints into a working, blueprint-driven timed mock-exam engine on mobile — replacing the hardcoded UPCAT flow.

**Architecture:** Pure builder/scorer utilities (`utils/examBuilder.ts`) + a local question-pool loader (`services/examBlueprints.ts`) feed a generic exam screen (`app/practice/exam/[slug].tsx`) and picker (`app/practice/exam/index.tsx`). The screen reads a blueprint via `getExamBlueprint` (Phase 1), builds sections from questions tagged with each section's `skill_category`, runs a data-driven total timer (+ per-section lock when `section_blocked`), applies guessing-penalty scoring with a pre-start warning, and surfaces course notes. The legacy `practice/upcat` routes redirect into it.

**Tech Stack:** Expo Router, React Native, Drizzle/expo-sqlite, Jest + better-sqlite3.

**Reference spec:** `docs/superpowers/specs/2026-06-10-exam-blueprints-design.md` · **Phase 1 (done):** `getExamBlueprint`, `listPublishedBlueprintSlugs` in `apps/mobile/services/examBlueprints.ts`; `upcat_questions.skill_category` synced.

**Reference implementation to adapt:** the existing `apps/mobile/app/practice/upcat/[subtest].tsx` (exam UI, timer, results) and `apps/mobile/utils/upcatExam.ts` (`buildExam`, `scoreExam`, `RawUpcatQuestion`, `RawUpcatPassage`, `ExamQuestion`, `shuffle`).

---

## File structure

| File | Responsibility | Action |
|---|---|---|
| `apps/mobile/utils/examBuilder.ts` | Pure: build a mock from a blueprint + question pools; penalty scoring | Create |
| `apps/mobile/utils/__tests__/examBuilder.test.ts` | Builder + scorer unit tests | Create |
| `apps/mobile/services/examBlueprints.ts` | Add `getQuestionsByCategory`, `getAllPassages` loaders | Modify |
| `apps/mobile/services/__tests__/examBlueprints.test.ts` | Loader tests | Modify (append) |
| `apps/mobile/app/practice/exam/[slug].tsx` | Generic blueprint-driven exam screen | Create |
| `apps/mobile/app/practice/exam/index.tsx` | Exam picker (published blueprints) | Create |
| `apps/mobile/app/practice/upcat/index.tsx` | Redirect → `/practice/exam/upcat` | Modify |
| `apps/mobile/app/(tabs)/index.tsx` | UPCAT countdown banner → `/practice/exam/upcat` | Modify (1 line) |

---

### Task 1: Pure builder + scorer (`examBuilder.ts`)

**Files:**
- Create: `apps/mobile/utils/examBuilder.ts`
- Test: `apps/mobile/utils/__tests__/examBuilder.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { buildBlueprintExam, scoreBlueprintExam } from '../examBuilder'
import type { ExamBlueprint } from '../../services/examBlueprints'
import type { RawUpcatQuestion } from '../upcatExam'

function q(id: string, n: number): RawUpcatQuestion[] {
  return Array.from({ length: n }, (_, i) => ({
    questionId: `${id}-${i}`, subtest: id, questionText: `Q${i}`, options: ['a','b','c','d'],
    correctIndex: 0, explanation: '', setId: null, setPosition: null,
  }))
}
const bp = (over: Partial<ExamBlueprint> = {}): ExamBlueprint => ({
  slug: 'x', name: 'X', acronym: 'X', totalItems: 0, totalTimeMinutes: 60,
  hasGuessingPenalty: false, guessingPenalty: 0.25, sectionBlocked: false, scoringNote: '', mechanicsNote: '',
  sections: [
    { id: 'x:1', name: 'Math', skillCategory: 'Mathematics', itemCount: 3, timeMinutes: null, requiresSpatialLogic: false, displayOrder: 1 },
    { id: 'x:2', name: 'Abstract', skillCategory: 'Abstract/Non-Verbal Reasoning', itemCount: 2, timeMinutes: null, requiresSpatialLogic: true, displayOrder: 2 },
  ],
  courseNotes: [], ...over,
})

describe('buildBlueprintExam', () => {
  it('samples item_count per section from its category pool; excludes empty sections', () => {
    const pools = new Map<string, RawUpcatQuestion[]>([['Mathematics', q('Mathematics', 10)]]) // no Abstract content
    const built = buildBlueprintExam(bp(), pools, [])
    expect(built.runnable.map(s => s.section.name)).toEqual(['Math'])
    expect(built.runnable[0]!.questions).toHaveLength(3)
    expect(built.comingSoon.map(s => s.name)).toEqual(['Abstract'])
    expect(built.totalQuestions).toBe(3)
  })

  it('caps a section at the available pool size when smaller than item_count', () => {
    const pools = new Map([['Mathematics', q('Mathematics', 2)]])
    const built = buildBlueprintExam(bp(), pools, [])
    expect(built.runnable[0]!.questions).toHaveLength(2)
  })
})

describe('scoreBlueprintExam', () => {
  it('no penalty: adjusted equals correct', () => {
    expect(scoreBlueprintExam(10, 6, 4, false, 0.25)).toMatchObject({ correct: 6, wrong: 4, blank: 0, adjusted: 6 })
  })
  it('penalty: adjusted = correct - penalty*wrong, blanks ignored', () => {
    const s = scoreBlueprintExam(10, 6, 2, true, 0.25) // 2 blank
    expect(s).toMatchObject({ correct: 6, wrong: 2, blank: 2 })
    expect(s.adjusted).toBeCloseTo(6 - 0.5)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mobile && npx jest examBuilder --silent`
Expected: FAIL ("buildBlueprintExam is not a function").

- [ ] **Step 3: Implement**

Create `apps/mobile/utils/examBuilder.ts`:
```ts
import type { ExamBlueprint, BlueprintSection } from '../services/examBlueprints'
import type { RawUpcatQuestion, RawUpcatPassage, ExamQuestion } from './upcatExam'

export interface BuiltSection { section: BlueprintSection; questions: ExamQuestion[]; available: number }
export interface BuiltExam { runnable: BuiltSection[]; comingSoon: BlueprintSection[]; totalQuestions: number }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!] }
  return a
}

/** Build a timed mock from a blueprint: each section samples up to item_count questions
 *  from its skill_category pool. Sections whose pool is empty are returned as comingSoon
 *  (shown in the structure preview, excluded from the runnable timed exam). Passage sets
 *  are kept contiguous and the passage text is attached. */
export function buildBlueprintExam(
  blueprint: ExamBlueprint,
  questionsByCategory: Map<string, RawUpcatQuestion[]>,
  passages: RawUpcatPassage[],
): BuiltExam {
  const passageById = new Map(passages.map(p => [p.setId, p.passageText]))
  const runnable: BuiltSection[] = []
  const comingSoon: BlueprintSection[] = []
  for (const section of [...blueprint.sections].sort((a, b) => a.displayOrder - b.displayOrder)) {
    const pool = questionsByCategory.get(section.skillCategory) ?? []
    if (pool.length === 0) { comingSoon.push(section); continue }
    const picked = shuffle(pool).slice(0, Math.max(1, section.itemCount))
    const questions: ExamQuestion[] = picked.map(q => ({ ...q, passageText: q.setId ? (passageById.get(q.setId) ?? null) : null }))
    runnable.push({ section, questions, available: pool.length })
  }
  return { runnable, comingSoon, totalQuestions: runnable.reduce((n, s) => n + s.questions.length, 0) }
}

export interface PenaltyScore { raw: number; adjusted: number; correct: number; wrong: number; blank: number }

/** Raw = correct; adjusted subtracts penalty×wrong when the exam has a guessing penalty
 *  (blanks are never penalized). */
export function scoreBlueprintExam(total: number, correct: number, wrong: number, hasPenalty: boolean, penalty: number): PenaltyScore {
  const blank = Math.max(0, total - correct - wrong)
  const adjusted = hasPenalty ? correct - penalty * wrong : correct
  return { raw: correct, adjusted, correct, wrong, blank }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/mobile && npx jest examBuilder --silent`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/utils/examBuilder.ts apps/mobile/utils/__tests__/examBuilder.test.ts
git commit -m "feat(mobile): blueprint exam builder + penalty scorer (pure)"
```

---

### Task 2: Question-pool loaders

**Files:**
- Modify: `apps/mobile/services/examBlueprints.ts`
- Test: `apps/mobile/services/__tests__/examBlueprints.test.ts` (append)

- [ ] **Step 1: Write the failing test** (append to the existing describe block)

```ts
import { getQuestionsByCategory, getAllPassages } from '../examBlueprints'
import { upcatQuestions, upcatPassages } from '../../db/schema'

describe('getQuestionsByCategory', () => {
  it('groups parsed questions by skill_category', async () => {
    const db = makeDb()
    await db.insert(upcatQuestions).values([
      { questionId: 'm1', subtest: 'Mathematics', skillCategory: 'Mathematics', questionText: '1+1?', options: JSON.stringify(['1','2','3','4']), correctIndex: 1, explanation: '' },
      { questionId: 's1', subtest: 'Science', skillCategory: 'Science', questionText: 'H2O?', options: JSON.stringify(['a','b','c','d']), correctIndex: 0, explanation: '' },
    ])
    const map = await getQuestionsByCategory(db, ['Mathematics', 'Science', 'Spatial'])
    expect(map.get('Mathematics')).toHaveLength(1)
    expect(map.get('Mathematics')![0]!.options).toEqual(['1','2','3','4'])
    expect(map.get('Science')).toHaveLength(1)
    expect(map.get('Spatial') ?? []).toHaveLength(0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/mobile && npx jest "services/__tests__/examBlueprints" --silent`
Expected: FAIL ("getQuestionsByCategory is not a function").

- [ ] **Step 3: Implement** (append to `apps/mobile/services/examBlueprints.ts`)

```ts
import { inArray } from 'drizzle-orm'
import { upcatQuestions, upcatPassages } from '../db/schema'
import type { RawUpcatQuestion, RawUpcatPassage } from '../utils/upcatExam'

function parseOptions(raw: string | null | undefined): string[] {
  try { const v = JSON.parse(raw ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

/** Load local questions for the given skill categories, grouped by category, parsed into
 *  the shape the builder/exam engine expects. */
export async function getQuestionsByCategory(db: DrizzleClient, categories: string[]): Promise<Map<string, RawUpcatQuestion[]>> {
  const map = new Map<string, RawUpcatQuestion[]>()
  if (categories.length === 0) return map
  const rows = await db.select().from(upcatQuestions).where(inArray(upcatQuestions.skillCategory, categories))
  for (const r of rows) {
    const cat = r.skillCategory ?? ''
    if (!map.has(cat)) map.set(cat, [])
    map.get(cat)!.push({
      questionId: r.questionId, subtest: r.subtest, questionText: r.questionText,
      options: parseOptions(r.options), correctIndex: r.correctIndex, explanation: r.explanation,
      setId: r.setId, setPosition: r.setPosition,
    })
  }
  return map
}

export async function getAllPassages(db: DrizzleClient): Promise<RawUpcatPassage[]> {
  const rows = await db.select().from(upcatPassages)
  return rows.map(p => ({ setId: p.setId, subtest: p.subtest, passageText: p.passageText }))
}
```
(Add `examSkillCategories`/etc. imports already exist; ensure `upcatQuestions, upcatPassages` are imported in this file.)

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/mobile && npx jest "services/__tests__/examBlueprints" --silent`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/mobile/services/examBlueprints.ts apps/mobile/services/__tests__/examBlueprints.test.ts
git commit -m "feat(mobile): getQuestionsByCategory + getAllPassages loaders"
```

---

### Task 3: Generic exam screen `app/practice/exam/[slug].tsx`

**Files:**
- Create: `apps/mobile/app/practice/exam/[slug].tsx`

**Adapt from** `apps/mobile/app/practice/upcat/[subtest].tsx` (copy its structure, styles, the question/answer UI, the `QuestionNavigator`/`PassagePanel` usage, and the timer logic), making these REQUIRED changes:

- [ ] **Step 1: Implement the screen with these behaviors**

1. **Params:** `const { slug } = useLocalSearchParams<{ slug: string }>()`.
2. **Load (in the `useEffect`):**
   ```ts
   const blueprint = await getExamBlueprint(db, slug)
   if (!blueprint) { setPhase('results'); setQuestions([]); return }
   const cats = Array.from(new Set(blueprint.sections.map(s => s.skillCategory)))
   const [pools, passages] = await Promise.all([getQuestionsByCategory(db, cats), getAllPassages(db)])
   const built = buildBlueprintExam(blueprint, pools, passages)
   // flatten runnable sections into a single ordered question list, remembering each question's section
   const flat = built.runnable.flatMap(bs => bs.questions.map(q => ({ q, sectionName: bs.section.name })))
   setBlueprint(blueprint); setBuilt(built); setQuestions(flat)
   setPhase(flat.length ? 'prestart' : 'empty')
   if (flat.length) setEndTime(Date.now() + blueprint.totalTimeMinutes * 60_000)
   ```
3. **New `prestart` phase** (before `exam`): show the exam name, `totalItems`/`totalTimeMinutes`, `mechanicsNote`, the structure preview (each section: name + count, with comingSoon sections greyed "Content coming soon"), and any `courseNotes` (show all; Phase 4 will filter by the student's target courses). If `hasGuessingPenalty`, show a prominent **warning** ("Wrong answers deduct {guessingPenalty}; blanks are 0"). A `PillButton` "Start exam" → `setPhase('exam')` and (re)sets `endTime` to now + total minutes so the clock starts on Start, not on load.
4. **`empty` phase:** "This exam's questions are being authored — check back soon." + back button. (No timer.)
5. **Timer:** reuse the existing absolute-`endTime` countdown + `fmtTime` + auto-submit + `submittedRef` guard from `[subtest].tsx`. The total time is `blueprint.totalTimeMinutes`.
6. **Section lock (when `blueprint.sectionBlocked`):** track the current section index derived from `idx` (each flat question knows its `sectionName`; group by section). Maintain a per-section `endTime` = section's `timeMinutes`. When a section's time expires, auto-advance `idx` to the first question of the next section (lock — the user can't go back into an expired section). When the LAST section's time expires, submit. If `sectionBlocked` is false, only the total timer applies. Keep it simple: compute section boundaries (start index of each section) once from `built.runnable`; show the active section name + its remaining time in the header beside the total time.
7. **Scoring (`submit`):** compute `correct`, `wrong` (answered but incorrect), and let `scoreBlueprintExam(total, correct, wrong, blueprint.hasGuessingPenalty, blueprint.guessingPenalty)` produce `adjusted`. On the results screen show raw `correct/total` AND, when `hasGuessingPenalty`, the adjusted score (e.g. "Penalty-adjusted: 5.25"). Keep the existing per-section-style breakdown but group by `sectionName`. Write `practice_sessions` per section via the existing `useRecordSession` (listingSlug = slug).
8. **Results:** keep the existing review list; add `blueprint.scoringNote` as a footnote.

- [ ] **Step 2: Type-check**

Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | grep -v __tests__ | grep -E "practice/exam|\\.tsx?\\("`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "apps/mobile/app/practice/exam/[slug].tsx"
git commit -m "feat(mobile): generic blueprint-driven exam screen"
```

---

### Task 4: Exam picker `app/practice/exam/index.tsx`

**Files:**
- Create: `apps/mobile/app/practice/exam/index.tsx`

- [ ] **Step 1: Implement**

A screen that loads `listPublishedBlueprintSlugs(db)` then, for each slug, `getExamBlueprint(db, slug)`, and renders a `ListCard` per exam (title = blueprint.name, subtitle = `${totalItems} items · ${Math.round(totalTimeMinutes/60*10)/10}h`, onPress → `router.push('/practice/exam/' + slug)`). Use `ScreenScroll` (tabBarInset={false}) + `SafeAreaView`, header "Mock Exams". Show a loading spinner while fetching.

- [ ] **Step 2: Type-check + commit**

Run: `cd apps/mobile && npx tsc --noEmit 2>&1 | grep -v __tests__ | grep -E "\\.tsx?\\("` → clean.
```bash
git add apps/mobile/app/practice/exam/index.tsx
git commit -m "feat(mobile): mock-exam picker (published blueprints)"
```

---

### Task 5: Redirect legacy UPCAT routes + update links

**Files:**
- Modify: `apps/mobile/app/practice/upcat/index.tsx` → make it a redirect.
- Modify: `apps/mobile/app/(tabs)/index.tsx` → the UPCAT countdown banner `onPress`.

- [ ] **Step 1: Redirect the legacy index**

Replace the body of `apps/mobile/app/practice/upcat/index.tsx` with:
```tsx
import { Redirect } from 'expo-router'
export default function UpcatRedirect() {
  return <Redirect href="/practice/exam/upcat" />
}
```
(Leave `app/practice/upcat/[subtest].tsx` in place — it is still reachable by any old deep links and unaffected; the new engine lives under `practice/exam`.)

- [ ] **Step 2: Point the Home banner at the generic exam**

In `apps/mobile/app/(tabs)/index.tsx`, change the UPCAT countdown banner press target from `router.push('/practice/upcat')` to `router.push('/practice/exam/upcat')` (and the same for any other `'/practice/upcat'` push in that file, e.g. the admissions-event handler).

- [ ] **Step 3: Run the home test (it references the banner) + type-check**

Run: `cd apps/mobile && npx jest "home.test" --silent && npx tsc --noEmit 2>&1 | grep -v __tests__ | grep -E "\\.tsx?\\("`
Expected: home tests pass; tsc clean. (The banner testID is unchanged; only the route differs.)

- [ ] **Step 4: Commit**

```bash
git add "apps/mobile/app/practice/upcat/index.tsx" "apps/mobile/app/(tabs)/index.tsx"
git commit -m "feat(mobile): route UPCAT mock through the generic exam engine"
```

---

### Task 6: Full verification + OTA

- [ ] **Step 1:** `cd apps/mobile && npx tsc --noEmit 2>&1 | grep -v __tests__ | grep -E "\\.tsx?\\(" ; npx jest --silent 2>&1 | tail -4` → app source clean, all suites pass.
- [ ] **Step 2:** `cd apps/mobile && npx eas-cli@latest update --branch production --message "feat: blueprint-driven multi-exam mock engine (phase 2)" --non-interactive`
- [ ] **Step 3:** `git push origin master`

---

## Self-Review

**Spec coverage (Phase 2 portion):**
- Generic `practice/exam/[slug]` reading the blueprint → Tasks 3. ✓
- Build sections from `skill_category` pools; "coming soon" for empty → Task 1 (`buildBlueprintExam`) + Task 3 prestart/empty phases. ✓
- Data-driven total timer + per-section lock when `section_blocked` → Task 3 Step 1 (5,6). ✓
- Guessing-penalty scoring + pre-start warning → Task 1 (`scoreBlueprintExam`) + Task 3 (3,7). ✓
- Course notes surfaced → Task 3 (3) shows all (Phase 4 filters by target course — explicitly deferred). ✓
- Results → `practice_sessions` (existing gamification) → Task 3 (7). ✓
- Legacy `upcat` route compatibility → Task 5. ✓

**Deferred to Phase 4 (not this plan):** filtering course notes by the student's actual `targetCourses`; launch "Take mock exam" from the Exams tab / listing detail; percentile bands. Phase 2 surfaces all course notes and is reachable via the picker + the (rerouted) Home UPCAT banner.

**Type consistency:** `buildBlueprintExam`/`scoreBlueprintExam`/`BuiltExam`/`BuiltSection`/`PenaltyScore` names match across Task 1 (impl + test) and Task 3 (consumer). `getQuestionsByCategory`/`getAllPassages` match Task 2 (impl + test) and Task 3. `ExamBlueprint`/`BlueprintSection` reused from Phase 1's `examBlueprints.ts`. `RawUpcatQuestion`/`RawUpcatPassage`/`ExamQuestion` reused from `upcatExam.ts`.

**Placeholder scan:** Task 3 specifies the screen as behaviors + complete new logic adapting a named reference file (`[subtest].tsx`) per the "follow existing patterns" guidance — not a placeholder; the reviewer verifies against the listed behaviors. Tasks 1, 2, 4, 5 are complete code.
