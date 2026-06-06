# Epic G — Exam-Flow Rework + IA (scoped) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]` checkboxes.

**Goal:** Fix the quiz flow (one shared corrected runner, no auto-advance, Quick/Full, Retake/Share), move Analytics tab→Updates shell + analytics→Profile, redesign Practice, add a Requirements screen + Home widget, and minor onboarding/Home/copy fixes — code-only, no C/D/F data.

**Architecture:** Extract the duplicated quiz runtime into `components/practice/FlashcardExam.tsx` (mirrors the corrected `practice/upcat/[subtest].tsx`); the 3 legacy routes become thin loaders (fetch→`enhancing`→`buildQuizQuestions`→runner). Reuse `components/upcat/QuestionNavigator.tsx`. Nav/Practice/Profile/Home are screen edits. One local SQLite table (`question_feedback`).

**Tech Stack:** Expo RN + expo-router + Drizzle/expo-sqlite + Jest.

**Spec:** [docs/superpowers/specs/2026-06-07-epic-g-exam-flow-ia-rework-design.md](../specs/2026-06-07-epic-g-exam-flow-ia-rework-design.md)

**Delivery:** code-only; ships in the final-batch OTA. No Supabase migration.

---

## File map

### New
```
apps/mobile/utils/flashcardExam.ts                       G2 pickQuestions (Quick/Full + dedup)
apps/mobile/utils/__tests__/flashcardExam.test.ts
apps/mobile/components/practice/FlashcardExam.tsx        G2 shared corrected runner
apps/mobile/components/practice/__tests__/FlashcardExam.test.tsx
apps/mobile/app/(tabs)/updates.tsx                       G1 Updates shell
apps/mobile/app/requirements.tsx                         G4 My Requirements screen
apps/mobile/components/practice/QuickFullSheet.tsx       G2 Quick/Full chooser (optional shared)
```
### Modified
```
apps/mobile/db/schema.ts                                 G2 question_feedback table
apps/mobile/db/client.ts                                 G2 migration
apps/mobile/app/practice/[topicId].tsx                   G2 → loader uses FlashcardExam
apps/mobile/app/practice/deck/[deckId].tsx               G2 → loader
apps/mobile/app/practice/listing/[slug].tsx              G2 → loader (mode=weak)
apps/mobile/app/(tabs)/_layout.tsx                       G1 analytics slot → updates
apps/mobile/components/.../TabBar...                      G1 Updates icon/label
apps/mobile/app/(tabs)/profile.tsx                       G1 analytics section
apps/mobile/app/(tabs)/analytics.tsx                     G1 removed/relocated
apps/mobile/app/(tabs)/practice.tsx                      G3 redesign
apps/mobile/app/(tabs)/index.tsx                         G4/G6 requirements widget + Kuya/deadlines
apps/mobile/app/onboarding.tsx                           G5 grouping/typo
```

---

## Task 1: `question_feedback` table

**Files:** `apps/mobile/db/schema.ts`, `apps/mobile/db/client.ts`

- [ ] **Step 1:** In `schema.ts` add:
```ts
export const questionFeedback = sqliteTable('question_feedback', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  cardId: text('card_id').notNull(),
  reason: text('reason').notNull().default(''),
  createdAt: integer('created_at').notNull(),
})
```
- [ ] **Step 2:** In `client.ts` MIGRATIONS append:
```ts
  `CREATE TABLE IF NOT EXISTS question_feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    card_id TEXT NOT NULL,
    reason TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`,
```
- [ ] **Step 3:** `cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -i question_feedback | head` → clean.
- [ ] **Step 4:** Commit `feat(mobile/practice): question_feedback table for in-quiz report`.

## Task 2: `pickQuestions` pure helper (TDD)

**Files:** `apps/mobile/utils/flashcardExam.ts` + test

- [ ] **Step 1: Failing test** `apps/mobile/utils/__tests__/flashcardExam.test.ts`:
```ts
import { pickQuestions, QUICK_SIZE, FULL_CAP } from '../flashcardExam'

const q = (id: string, question = id) => ({ id, question, options: ['a','b','c','d'], correctIndex: 0 }) as any

describe('pickQuestions', () => {
  it('full mode returns all up to FULL_CAP, order preserved', () => {
    const items = Array.from({ length: 10 }, (_, i) => q('c'+i))
    expect(pickQuestions(items, 'full').map(x => x.id)).toEqual(items.map(x => x.id))
  })
  it('full mode caps at FULL_CAP', () => {
    const items = Array.from({ length: FULL_CAP + 20 }, (_, i) => q('c'+i))
    expect(pickQuestions(items, 'full').length).toBe(FULL_CAP)
  })
  it('quick mode returns at most QUICK_SIZE', () => {
    const items = Array.from({ length: 100 }, (_, i) => q('c'+i))
    const out = pickQuestions(items, 'quick')
    expect(out.length).toBe(QUICK_SIZE)
    expect(out.length).toBeGreaterThan(0)
  })
  it('quick mode returns all when fewer than QUICK_SIZE', () => {
    const items = Array.from({ length: 5 }, (_, i) => q('c'+i))
    expect(pickQuestions(items, 'quick').length).toBe(5)
  })
  it('drops in-session duplicates by normalized question text', () => {
    const items = [q('a','What is 2+2?'), q('b','what is 2+2? '), q('c','Other')]
    const out = pickQuestions(items, 'full')
    expect(out.length).toBe(2)
  })
})
```
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Implement `apps/mobile/utils/flashcardExam.ts`:
```ts
export const QUICK_SIZE = 15
export const FULL_CAP = 60

function norm(s: string): string { return (s ?? '').toLowerCase().replace(/\s+/g, ' ').trim() }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j]!, a[i]!] }
  return a
}

export function pickQuestions<T extends { question: string }>(all: T[], mode: 'quick' | 'full'): T[] {
  // in-session duplicate guard (first occurrence wins, order preserved)
  const seen = new Set<string>()
  const deduped: T[] = []
  for (const item of all) { const k = norm(item.question); if (k && !seen.has(k)) { seen.add(k); deduped.push(item) } }
  if (mode === 'full') return deduped.slice(0, FULL_CAP)
  if (deduped.length <= QUICK_SIZE) return deduped
  return shuffle(deduped).slice(0, QUICK_SIZE)
}
```
- [ ] **Step 4:** Run → PASS.
- [ ] **Step 5:** Commit `feat(mobile/practice): pickQuestions (Quick/Full + in-session dedup)`.

## Task 3: `FlashcardExam` shared runner (+ tests)

**Files:** `apps/mobile/components/practice/FlashcardExam.tsx` + test

- [ ] **Step 1: Read references** — read `apps/mobile/app/practice/upcat/[subtest].tsx` (the corrected flow to mirror), `apps/mobile/components/upcat/QuestionNavigator.tsx` (reuse), `apps/mobile/utils/mcDistractors.ts` for the EXACT `QuizQuestion` type (fields — likely `{ id?, question, options: string[], correctIndex: number, explanation?: string }`; reconcile), `apps/mobile/hooks/useRecordSession.ts`, and `apps/mobile/theme/ThemeContext`.

- [ ] **Step 2: Implement** `apps/mobile/components/practice/FlashcardExam.tsx`. Props:
```ts
interface FlashcardExamProps { title: string; questions: QuizQuestion[]; listingSlug?: string; subtest?: string; onExit: () => void }
```
Behavior (mirror the UPCAT screen, adapted to QuizQuestion + flashcards):
  - Phases `exam | results`; `answers: Record<number, number>`; `startRef = useState(()=>Date.now())[0]`.
  - **No auto-advance:** option press = `setAnswers(a => ({...a,[idx]:oi}))` only. Footer: Back (disabled idx 0), Skip (ghost, advances without answer), Next/Submit (primary; disabled when current unanswered on non-last; on last = Submit).
  - Reuse `<QuestionNavigator total currentIdx answeredIdxs onJump={setIdx} />`.
  - Per-question **Report** button → insert into `questionFeedback` (`{ cardId: q.id ?? String(idx), reason: 'reported', createdAt: Date.now() }`) via `useDb`; show a toast/inline "Reported".
  - **Untimed** (no countdown).
  - Submit → compute score (count answers[i]===q.correctIndex) → `recordSession({ listingSlug: listingSlug ?? '', topicId:'', deckId:'', score, total, startTime: startRef, subtest })` → results phase.
  - Results: overall % + correct/total, per-question review (correct ✓ / chosen ✗ / explanation), **"Retake exam"** (reset answers+idx+phase='exam') + **"Share score"** (`import { Share } from 'react-native'; Share.share({ message: \`I scored ${pct}% on ${title} in Iskotify!\` })`) + a button calling `onExit()`.
  - Match the UPCAT screen's styles/theme tokens.

- [ ] **Step 3: Tests** `apps/mobile/components/practice/__tests__/FlashcardExam.test.tsx` (RN Testing Library, mirror existing component tests): selecting an option does NOT advance (still on Q1; Next exists); pressing Next advances; answering all + Submit shows results with the score; "Retake exam" returns to Q1; "Share score" calls a mocked `Share.share`. Mock `useDb`/`useRecordSession` like sibling tests.
  Run: `cd apps/mobile && pnpm jest components/practice/__tests__/FlashcardExam.test.tsx` → PASS.
- [ ] **Step 4:** Commit `feat(mobile/practice): shared FlashcardExam runner (corrected flow, retake, share, report)`.

## Task 4: Refactor the 3 loader screens to use FlashcardExam

**Files:** `apps/mobile/app/practice/[topicId].tsx`, `deck/[deckId].tsx`, `listing/[slug].tsx`

- [ ] **Step 1:** For EACH screen: keep its data loading + the committed `enhancing` phase + `buildQuizQuestions`. REMOVE the `ready` config screen's manual item-count + timer pickers and the in-quiz/`results` blocks. Replace with: a small Quick/Full chooser (inline or `QuickFullSheet`), then `const questions = pickQuestions(buildQuizQuestions(cardRows), mode)`, then render `<FlashcardExam title=… questions={questions} listingSlug=… onExit={() => router.back()} />`. `listing/[slug].tsx` keeps `mode=all|weak` for CARD selection (which cards), independent of the Quick/Full SIZE choice. Delete now-dead timer code/styles.
- [ ] **Step 2:** Type-check + any existing screen tests: `cd apps/mobile && pnpm exec tsc --noEmit 2>&1 | grep -v node_modules | grep -iE "practice/" | head; pnpm jest practice 2>&1 | tail -8`.
- [ ] **Step 3:** Commit `refactor(mobile/practice): legacy quiz screens use shared FlashcardExam (no auto-advance, Quick/Full)`.

## Task 5: Updates shell + tab swap

**Files:** `apps/mobile/app/(tabs)/updates.tsx`, `_layout.tsx`, TabBar component

- [ ] **Step 1:** Create `updates.tsx` — a SafeAreaView with header "Updates" + sections placeholders ("Upcoming Events", "News", "Iskotify Updates") each with a "Coming soon" empty-state. Use theme tokens; match other tab screens' shell.
- [ ] **Step 2:** In `_layout.tsx`, replace the `analytics` Tabs.Screen with `updates` (or rename) in slot 4; update the TabBar icon/label mapping (Analytics→Updates icon, e.g. a bell/newspaper). Ensure the `analytics` route is no longer a tab.
- [ ] **Step 3:** Type-check + `pnpm jest "(tabs)" 2>&1 | tail -6`.
- [ ] **Step 4:** Commit `feat(mobile/nav): Updates tab shell replaces Analytics slot`.

## Task 6: Analytics dashboard → Profile

**Files:** `apps/mobile/app/(tabs)/profile.tsx`, move logic from `analytics.tsx`

- [ ] **Step 1:** Add an "Analytics" section to `profile.tsx` below the Focus list, rendering the analytics dashboard (reuse `useAnalytics`, `WeeklyChart`, `StatCard`, mastery accordion, recent sessions). Extract the dashboard JSX from `analytics.tsx` into a reusable `components/analytics/AnalyticsDashboard.tsx` if cleaner, used by Profile. Remove/empty the old `analytics.tsx` (it's no longer a tab after Task 5; delete the file or leave it unreferenced — prefer delete to avoid a dead route, but confirm nothing imports it).
- [ ] **Step 2:** Type-check + profile/analytics tests: `pnpm jest profile analytics 2>&1 | tail -8`. Update tests that referenced the analytics tab.
- [ ] **Step 3:** Commit `feat(mobile/profile): analytics dashboard moved into Profile`.

## Task 7: Practice tab redesign

**Files:** `apps/mobile/app/(tabs)/practice.tsx`

- [ ] **Step 1:** Read it. Remove the "Quick Start" section (Full Review Deck + Weak Topics Only). Add a header stats row (Overall score = avg accuracy, Streak 🔥, Exams taken) from `useAnalytics('overall')` (or a light derived selector). Show a %-score on each My Focus card (`useAnalytics(slug).avgAccuracy`). Add an "AI General Feedback" card that lists the user's weakest subjects/topics from mastery data (text only). Keep UPCAT card, Recommended, Saved Decks, Subject accordion, AI banner. Don't break navigation to the (now reworked) listing quiz — route weak/full review via the Subject accordion / Recommended instead of the removed Quick Start (or a single "Review [focus]" entry that opens the listing loader).
- [ ] **Step 2:** Type-check + `pnpm jest "(tabs)/__tests__/practice" 2>&1 | tail -6` (update/asserting no "Quick Start"/"Full Review Deck").
- [ ] **Step 3:** Commit `feat(mobile/practice): redesigned hub (stats header, %-focus, AI feedback; remove Quick Start)`.

## Task 8: Requirements screen + Home widget

**Files:** `apps/mobile/app/requirements.tsx`, `apps/mobile/app/(tabs)/index.tsx`

- [ ] **Step 1:** Read `components/RequirementsChecklist.tsx` + `services/coachQueue.ts` (`getAcquiredRequirementIndices`/`toggleRequirement`) + how focused listings + their `requirements` are loaded. Create `requirements.tsx`: for each focused listing with non-empty `requirements`, render `RequirementsChecklist` under a listing header; show an aggregate "X of Y acquired". Add a Profile entry card linking to `/requirements`.
- [ ] **Step 2:** Home widget in `(tabs)/index.tsx`: compute total missing = Σ(listing.requirements.length − acquiredCount) across focused listings; render a compact "Kulang na requirements: N" card linking to `/requirements` (hide when 0 or none). Use existing data access.
- [ ] **Step 3:** Type-check + tests: `pnpm jest requirements index 2>&1 | tail -6`.
- [ ] **Step 4:** Commit `feat(mobile/requirements): My Requirements screen + Home missing-requirements widget`.

## Task 9: Onboarding grouping + typos

**Files:** `apps/mobile/app/onboarding.tsx` + grep for typos

- [ ] **Step 1:** In the onboarding listing picker (step 2), group the list under "Exams" and "Scholarships" headers (by `type`) instead of a flat alphabetical list (university segmentation deferred). Keep selection behavior. Confirm pre-assessment remains last + skippable.
- [ ] **Step 2:** Fix typos: `grep -rn "Assesment" apps/mobile --include=*.tsx --include=*.ts` and correct each to "Assessment"; fix any other obvious ones found.
- [ ] **Step 3:** Type-check + `pnpm jest onboarding 2>&1 | tail -6`.
- [ ] **Step 4:** Commit `feat(mobile/onboarding): group picker by Exams/Scholarships; fix Assessment typo`.

## Task 10: Home improvements (light)

**Files:** `apps/mobile/app/(tabs)/index.tsx`

- [ ] **Step 1:** Add a prominent Kuya Baw chat entry near the top (route to the existing chat). Add an "Upcoming deadlines" mini-list from focused listings' `deadline` (nearest first, hide past). Add a "Weak areas" cards row from mastery data (top weak subjects), deep-linking into the subject/topic practice. Reuse existing components/data; keep it light. (The requirements widget from Task 8 also lives here.)
- [ ] **Step 2:** Type-check + `pnpm jest "(tabs)/__tests__/index" 2>&1 | tail -6` (if exists).
- [ ] **Step 3:** Commit `feat(mobile/home): Kuya Baw entry, upcoming deadlines, weak-area cards`.

## Task 11: Verify

- [ ] **Step 1:** `cd apps/mobile && pnpm test 2>&1 | tail -6` (full suite green); `cd apps/admin && pnpm test 2>&1 | tail -4` (unaffected, still green).
- [ ] **Step 2:** Manual smoke (after OTA): take a topic quiz → no auto-advance, skip/back/change work, Quick/Full, submit → results with Retake + Share; Updates tab shows shell; Profile shows analytics; Practice has stats header + no Quick Start; Requirements screen + Home widget; onboarding grouped + no "Assesment".

---

## Self-review against the spec
- G1 nav IA → Tasks 5–6 ✓ (Updates shell + analytics→Profile)
- G2 exam-flow rework → Tasks 1–4 ✓ (question_feedback, pickQuestions, FlashcardExam, loaders; no auto-advance, skip/back/change, Quick/Full, Retake, Share, report, dedup; enhancing preserved)
- G3 Practice redesign → Task 7 ✓
- G4 Requirements → Task 8 ✓
- G5 onboarding/copy → Task 9 ✓
- G6 Home → Task 10 ✓
- Deferred (C/D/F + vault) correctly excluded ✓
- Type/name consistency: `FlashcardExam`/`pickQuestions`/`QUICK_SIZE`/`FULL_CAP`/`questionFeedback`/`QuizQuestion` used consistently ✓
