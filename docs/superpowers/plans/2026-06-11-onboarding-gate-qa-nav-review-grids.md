# Onboarding Gate + Q&A Navigation + Review Grids — Spec & Implementation Plan

> **For agentic workers:** Executed via superpowers:subagent-driven-development (fresh implementer per task + spec review + quality review). Mobile only (`apps/mobile`), JS-only → OTA, NO app.json bump. NativeWind REMOVED — StyleSheet + theme tokens only. Never `{count && <JSX/>}`. Follow [[uiux-density-patterns]]: ≤2 badges on rows, one primary CTA, disclosure depth 1, maxFontSizeMultiplier 1.4 on dense text, ≥44pt targets.

## Spec

### Part 1 — Onboarding data-readiness gate
**Today:** `handleConfirmStep2` (onboarding.tsx:298-360) writes selectedListingSlug + focusListings then fires `void syncOnLaunch(db)` (line 357, NOT awaited). User proceeds through courses → matcher → pre-assessment. `finishOnboarding()` (:482-484) routes to tabs instantly — if the first sync (large: ~1,253 cards + catalogs) hasn't finished, tabs are empty until next launch. Pre-assessment SKIP (:1041) calls finishOnboarding directly — same gap.

**Design:**
- Track sync lifecycle in onboarding state: `syncStatus: 'idle'|'running'|'done'|'error'`. `handleConfirmStep2` sets 'running' and attaches `.then(()=>set('done')).catch(()=>set('error'))` to the EXISTING fire-and-forget call (keep runEnhancement chained on success, also non-blocking).
- `finishOnboarding()`: if `syncStatus === 'done'` (or 'idle' — defensive: nothing to wait for) → route immediately (no gate flash). If 'running' → render the **Getting Ready gate** (full-screen, replaces pre-assessment content): mascot image (kuya-baw-mascot.png), title **"Hang tight, almost there! 🎒"**, body **"We're preparing your reviewers, exams, and scholarship matches based on what you picked. First-time setup usually takes under a minute."**, ActivityIndicator. NO technical words (no "sync", "database", "fetching"). When syncStatus flips 'done' → auto `router.replace('/(tabs)')`.
- 'error' on the gate → title **"Hmm, that didn't load 😅"**, body **"Please check your internet connection and try again."**, primary **Try again** (re-fires syncOnLaunch with status tracking), ghost **Continue anyway** (subtext "We'll finish getting things ready next time you open the app.") → routes to tabs.
- Same gate path for pre-assessment **Skip** (it calls finishOnboarding).
- A11y: gate text scalable (no fixed heights), buttons ≥44pt.

### Part 2 — Exam Q&A screen navigation (`app/practice/exam/[slug].tsx` + `components/upcat/QuestionNavigator.tsx`)
1. **Subject + Topic above the question**: thread `mainSubject`/`topic` from local DB → add `mainSubject?: string|null; topic?: string|null` to `RawUpcatQuestion` (utils/upcatExam.ts:4-7) → map them in `getQuestionsByCategory` (services/examBlueprints.ts:52-67). In the exam phase render, ABOVE the question card: a compact one-line bar: `{mainSubject ?? sectionName}` (bold, subject) + ` · ${topic}` when topic present (secondary). numberOfLines={1}, maxFontSizeMultiplier 1.4.
2. **Section chips** under the QuestionNavigator: horizontal chip row (style mirrors practice.tsx chip styles :371-378), one chip per SectionBound (name + answered-count e.g. "Math 12/60"? keep simple: name only), current section highlighted (where idx falls). Tap → jump to `Math.max(bound.start, floorIdx)`. When `sectionBlocked`: chips for sections with `start < floorIdx` are DISABLED (opacity 0.4, accessibilityState disabled) — back-navigation locks must hold; forward sections beyond the current one are also disabled when sectionBlocked (timer governs advancement). Non-blocked exams: all chips enabled.
3. **Auto-scrolling QuestionNavigator** (components/upcat/QuestionNavigator.tsx — currently a manual ScrollView of 30px cells, gap 6): add ScrollView ref + measured viewport width (onLayout) + `useEffect` on `currentIdx`: `scrollTo({ x: max(0, currentIdx*ITEM_SPAN - viewportWidth/2 + ITEM_SPAN/2), animated: true })` (ITEM_SPAN = 36). Benefits BOTH the blueprint exam and legacy `app/practice/upcat/[subtest].tsx` (no API change — props unchanged).

### Part 3 — Review screen grids + Mock Exams (`app/(tabs)/practice.tsx`)
1. **Recommended rail → 2-column grid**: replace horizontal ScrollView (:596-615) with `flexDirection:'row', flexWrap:'wrap', gap: spacing.sm` + card width '48%' (pattern from notes/index.tsx). Show up to 4 (2×2; was 5). Keep RecommendedCard content/navigation.
2. **My Focus rail → 2-column grid**: same conversion (:638-660). FocusCard keeps select-on-tap + Review action. **Add "📝 Mock exam" secondary action** on each focus card whose `slug` is in the published-blueprint set → `router.push('/practice/exam/'+slug)`. Two compact buttons (Review / Mock) — keep ≥44pt touch, stack vertically inside the card if width-constrained.
3. **NEW "Mock Exams" section** directly UNDER My Focus: SectionHeader "Mock Exams" + trailing "See all" → `router.push('/practice/exam')`. 2-column grid of up to 4 published blueprints, **recommended-first ordering**: blueprints whose slug ∈ user's focus slugs first (by focus priority), then the rest by displayOrder. Card: GridCard or compact card with acronym/name + `${totalItems} items · ${hours}h` subtitle. New service fn `listPublishedBlueprints(db)` returning `{slug,name,acronym,totalItems,totalTimeMinutes}[]` ordered by displayOrder (services/examBlueprints.ts — mirror listPublishedBlueprintSlugs). Fetch via `cachedQuery('practice:blueprints:list', 30_000, ...)`; the screen already subscribes to 'practice:'.
4. Density rules hold: section spacing ≥ spacing.xl; grid cards ≤2 lines of text; no horizontal ScrollViews remain in Recommended/Focus/MockExams sections.

## Tasks (sequential, SDD: implementer → spec review → quality review each)

### Task A — Onboarding readiness gate
Files: `app/onboarding.tsx` (+ test `app/__tests__/onboarding.test.tsx` or wherever onboarding tests live — check `app/(tabs)/__tests__`/`app/__tests__`). TDD where testable: extract a pure decision helper `gateDecision(syncStatus): 'route'|'gate'|'error-gate'` is trivial — instead test via component test: mock syncOnLaunch with a controllable promise; assert (1) finishing pre-assessment while pending shows the gate copy, (2) resolve → routed (router.replace mock called with /(tabs)), (3) reject → error copy + Try again refires + Continue anyway routes, (4) finishing after already-resolved routes immediately without gate. Reuse onboarding's existing test harness/mocks. Copy strings EXACTLY as specified in Part 1.

### Task B — Q&A navigation (subject/topic bar, section chips, auto-scroll navigator)
Files: `utils/upcatExam.ts`, `services/examBlueprints.ts` (+ its services test: extend mapping test to assert mainSubject/topic come through), `components/upcat/QuestionNavigator.tsx`, `app/practice/exam/[slug].tsx`. Pure-test the chip-enabled logic: extract `sectionChipState(bounds, idx, floorIdx, sectionBlocked)` → array of `{name,start,active,disabled}` into `utils/examBuilder.ts` with unit tests (blocked: past+future disabled, current enabled; non-blocked: all enabled; active = section containing idx). Auto-scroll: no test (visual) — flag for on-device.

### Task C — Review grids + focus mock action + Mock Exams section
Files: `services/examBlueprints.ts` (`listPublishedBlueprints` + services test incl. draft exclusion + ordering), `app/(tabs)/practice.tsx` (+ practice.test.tsx updates: grids render, Mock Exams section shows ≤4 + See all present when blueprints exist, focus card shows Mock button only for blueprint slugs), pure helper `orderBlueprintsForUser(blueprints, focusSlugs)` (recommended-first) in `utils/examBuilder.ts` or `utils/` with unit tests (focus-first by priority, then displayOrder, cap 4 applied by caller).

### Final — controller: full jest + tsc + react-doctor, push, single OTA, on-device checklist.
